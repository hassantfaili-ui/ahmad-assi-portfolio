#!/usr/bin/env node
/**
 * One time import from the Astro site into Postgres and R2.
 *
 * Kept in the repository rather than run once and deleted, because it is the
 * only thing that can rebuild the database from the content that is still in
 * git. It is idempotent: an object already in the bucket is not re-uploaded and
 * a row already present is updated rather than duplicated, so it can be run
 * against a fresh database at any time.
 *
 *   node scripts/migrate-content.mjs               upload and write
 *   node scripts/migrate-content.mjs --skip-upload write rows only, for local work
 *   node scripts/migrate-content.mjs --verify-only check what is already there
 *
 * It verifies before it reports success. Every media row must resolve to an
 * object that actually exists, every project must have a lead image, and every
 * image must have alt text. A migration that half worked and said nothing is
 * worse than one that failed loudly.
 */

import 'dotenv/config';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/* The Astro site is still on main, in the sibling checkout. Content and media
   were kept in this worktree too, so both paths are tried and the local one
   wins. */
const SOURCES = [REPO, resolve(REPO, '..', 'Ahmad Assi Website')];

const args = new Set(process.argv.slice(2));
const SKIP_UPLOAD = args.has('--skip-upload');
const VERIFY_ONLY = args.has('--verify-only');

// ------------------------------------------------------------------ paths ---

function findSource(relative) {
  for (const root of SOURCES) {
    const candidate = join(root, relative);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function requireSource(relative) {
  const found = findSource(relative);
  if (!found) throw new Error(`Cannot find ${relative} in any of: ${SOURCES.join(', ')}`);
  return found;
}

/**
 * A content path becomes an R2 object key.
 *
 * The three films and their posters keep the media/ prefix they already have in
 * the bucket, because the site has been serving them from those keys and
 * re-uploading 116MB to rename them would achieve nothing. Everything else goes
 * under projects/<slug>/, which is flat enough to browse and specific enough
 * that two projects cannot collide on a file called site-plan.jpg.
 */
function keyForContentPath(contentPath, slug) {
  const clean = contentPath.replace(/^\/+/, '');
  const name = basename(clean);

  // /media/hero-1440.mp4 and /media/lincoln-beach-film-poster.jpg, the files
  // that sit at the top of public/media rather than in a project folder.
  if (/^media\/[^/]+$/.test(clean)) return `media/${name}`;

  // The two PDFs are served from /cv/ and /portfolio/ today. They are documents
  // rather than project media, so they land together under documents/.
  if (/^(cv|portfolio)\//.test(clean)) return `documents/${name}`;

  // /media/<project>/<file>
  const inProject = clean.match(/^media\/([^/]+)\/(.+)$/);
  if (inProject) return `projects/${inProject[1]}/${inProject[2]}`;

  return `projects/${slug}/${name}`;
}

/** Where the file actually is on disk, given the path a content file uses. */
function localPathForContentPath(contentPath) {
  const clean = contentPath.replace(/^\/+/, '');

  // The films are masters kept outside public/ on purpose: anything in public/
  // was published, and the Astro size check ran before any integration could
  // remove it. So they live at media/ in the repo root.
  const name = basename(clean);
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) {
    const master = findSource(join('media', name));
    if (master) return master;
  }

  return findSource(join('public', clean));
}

// --------------------------------------------------------------- database ---

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL. Copy .env.example to .env.');
  return url;
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: connectionString(),
    ...(connectionString().includes('sslmode=require') ? { ssl: { rejectUnauthorized: false } } : {}),
  }),
});

// --------------------------------------------------------------------- r2 ---

let s3;
function r2() {
  if (s3) return s3;
  const need = (k) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing ${k}. Set it, or pass --skip-upload.`);
    return v;
  };
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${need('CLOUDFLARE_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: need('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: need('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
  });
  return s3;
}

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'ahmadassi-media';

async function objectExists(key) {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
    throw error;
  }
}

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.pdf': 'application/pdf',
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
}

function kindFor(contentType) {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'document';
}

// ------------------------------------------------------------------ media ---

const mediaCache = new Map();
const stats = { uploaded: 0, alreadyInBucket: 0, rowsWritten: 0, skipped: [] };

/**
 * Ensure one file exists in the bucket and has a Media row, and return the row.
 * Cached, because the same poster is referenced by two different places and
 * hashing a 73MB film twice is pure waste.
 */
async function ensureMedia(contentPath, slug) {
  if (!contentPath) return null;
  const key = keyForContentPath(contentPath, slug);
  if (mediaCache.has(key)) return mediaCache.get(key);

  const local = localPathForContentPath(contentPath);
  if (!local) {
    stats.skipped.push(`${contentPath} (no file on disk)`);
    return null;
  }

  const info = await stat(local);
  const contentType = contentTypeFor(local);
  const kind = kindFor(contentType);

  let width = null;
  let height = null;
  if (kind === 'image') {
    try {
      const meta = await sharp(local).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      /* An unreadable image must not take the whole migration down. The row is
         still written; next/image falls back to the declared dimensions. */
    }
  }

  if (!SKIP_UPLOAD && !VERIFY_ONLY) {
    if (await objectExists(key)) {
      stats.alreadyInBucket += 1;
    } else {
      await r2().send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: await readFile(local),
          ContentType: contentType,
        }),
      );
      stats.uploaded += 1;
    }
  }

  const row = await db.media.upsert({
    where: { key },
    update: { contentType, bytes: info.size, width, height, kind },
    create: {
      key,
      kind,
      contentType,
      bytes: info.size,
      originalName: basename(local),
      width,
      height,
    },
  });

  stats.rowsWritten += 1;
  mediaCache.set(key, row);
  return row;
}

// ---------------------------------------------------------------- mapping ---

const STATUS_MAP = {
  Built: 'Built',
  'Under construction': 'UnderConstruction',
  'Design development': 'DesignDevelopment',
  Unbuilt: 'Unbuilt',
  Competition: 'Competition',
  Academic: 'Academic',
};

function mapStatus(value) {
  const mapped = STATUS_MAP[value];
  if (!mapped) throw new Error(`Unknown status: ${value}`);
  return mapped;
}

// --------------------------------------------------------------- projects ---

async function migrateProjects() {
  const dir = requireSource(join('src', 'content', 'projects'));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();

  console.log(`\nProjects: ${files.length} files in ${dir}`);

  for (const file of files) {
    const slug = basename(file, '.md');
    const raw = await readFile(join(dir, file), 'utf8');
    const { data, content } = matter(raw);

    const leadImage = await ensureMedia(data.leadImage?.src, slug);

    const project = await db.project.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: data.title,
        sheet: data.sheet,
        category: data.category,
        year: data.year,
        location: data.location,
        buildingType: data.buildingType,
        area: data.area ?? null,
        status: mapStatus(data.status),
        role: data.role,
        contribution: data.contribution,
        summary: data.summary,
        body: content.trim(),
        credit: data.credit,
        tier: data.tier ?? 'set',
        order: data.order ?? 99,
        published: true,
      },
    });

    /* Replace the arrangement rather than merging it. Merging would double
       every image on a second run, and the arrangement is exactly the thing the
       markdown file is authoritative about. */
    await db.imageGroup.deleteMany({ where: { projectId: project.id } });
    await db.drawing.deleteMany({ where: { projectId: project.id } });
    await db.film.deleteMany({ where: { projectId: project.id } });

    await db.project.update({
      where: { id: project.id },
      data: {
        title: data.title,
        sheet: data.sheet,
        category: data.category,
        year: data.year,
        location: data.location,
        buildingType: data.buildingType,
        area: data.area ?? null,
        status: mapStatus(data.status),
        role: data.role,
        contribution: data.contribution,
        summary: data.summary,
        body: content.trim(),
        credit: data.credit,
        tier: data.tier ?? 'set',
        order: data.order ?? 99,
        leadImageId: leadImage?.id ?? null,
        leadImageAlt: data.leadImage?.alt ?? '',
      },
    });

    let groupOrder = 0;
    for (const group of data.imageGroups ?? []) {
      const images = [];
      let imageOrder = 0;
      for (const image of group.images ?? []) {
        const media = await ensureMedia(image.src, slug);
        if (!media) continue;
        images.push({ mediaId: media.id, alt: image.alt ?? '', order: imageOrder++ });
      }
      if (images.length === 0) continue;

      await db.imageGroup.create({
        data: {
          projectId: project.id,
          layout: group.layout ?? 'pair',
          caption: group.caption ?? null,
          order: groupOrder++,
          images: { create: images },
        },
      });
    }

    let drawingOrder = 0;
    for (const drawing of data.drawings ?? []) {
      const media = await ensureMedia(drawing.src, slug);
      if (!media) continue;
      await db.drawing.create({
        data: {
          projectId: project.id,
          mediaId: media.id,
          alt: drawing.alt ?? '',
          drawingType: drawing.drawingType ?? 'Drawing',
          order: drawingOrder++,
        },
      });
    }

    if (data.film) {
      const poster = await ensureMedia(data.film.poster, slug);
      const source = data.film.src ? await ensureMedia(data.film.src, slug) : null;
      await db.film.create({
        data: {
          projectId: project.id,
          posterMediaId: poster?.id ?? null,
          youtubeId: data.film.youtube ?? null,
          caption: data.film.caption ?? null,
          /* The walkthrough exists as a single 1440p encode today. Anything
             Ahmad uploads from now on arrives as two, made in the browser. */
          sources: source ? { create: [{ mediaId: source.id, height: 1440 }] } : undefined,
        },
      });
    }

    console.log(
      `  ${slug.padEnd(28)} ${String(data.imageGroups?.length ?? 0).padStart(2)} groups, ` +
        `${String(data.drawings?.length ?? 0).padStart(2)} drawings${data.film ? ', film' : ''}`,
    );
  }
}

// -------------------------------------------------------------- hero film ---

/**
 * The site hero was never in a content file: it was hardcoded in
 * HeroFilm.astro, which is why it needs its own step here rather than falling
 * out of the project loop.
 */
async function migrateHeroFilm() {
  const large = await ensureMedia('/media/hero-1440.mp4', 'hero');
  const small = await ensureMedia('/media/hero-720.mp4', 'hero');
  const poster = await ensureMedia('/media/hero-poster.jpg', 'hero');

  await db.film.deleteMany({ where: { projectId: null } });

  const sources = [];
  if (large) sources.push({ mediaId: large.id, height: 1440 });
  if (small) sources.push({ mediaId: small.id, height: 720 });

  await db.film.create({
    data: {
      projectId: null,
      posterMediaId: poster?.id ?? null,
      caption: 'Lincoln Beach Center, Walkthrough',
      sources: { create: sources },
    },
  });

  console.log(`\nHero film: ${sources.length} encodes${poster ? ', poster' : ', NO POSTER'}`);
}

// ----------------------------------------------------------------- resume ---

/**
 * The four At a glance blocks on the resume page were hardcoded markup, not
 * data, so they become Fact rows here. The layout does not change; Ahmad can
 * now edit them.
 */
const AT_A_GLANCE = [
  {
    label: 'Qualification',
    items: [
      'B.A.S. (Honours), Urbanism major, Carleton University, 2025',
      "Dean's Honour List, Faculty of Engineering and Design",
      'International Baccalaureate, 2021',
    ],
  },
  {
    label: 'Practice',
    items: [
      'Independent residential design since 2023, one house under construction',
      'Built interiors and landscape delivered, not only drawn',
      'Project support on Government of Canada work, 2025',
    ],
  },
  {
    label: 'On site',
    items: [
      'Five years of residential construction labour across Ottawa',
      'Site preparation, landscaping, finishing and installations',
      'Detailing informed by having built the thing',
    ],
  },
  {
    label: 'Beyond the studio',
    items: [
      'Four languages: English, French and Arabic fluent, Spanish intermediate',
      'Scouts leader and youth programme admin, ABCCO',
      'Four years running a kitchen, ending as senior chef',
    ],
  },
];

async function migrateResume() {
  const path = requireSource(join('src', 'data', 'resume.json'));
  const r = JSON.parse(await readFile(path, 'utf8'));

  const cv = r.cvFile ? await ensureMedia(r.cvFile, 'documents') : null;
  const portfolio = r.portfolioFile ? await ensureMedia(r.portfolioFile, 'documents') : null;

  const fields = {
    name: r.name,
    discipline: r.discipline,
    credential: r.credential,
    registration: r.registration,
    location: r.location,
    yearsExperience: r.yearsExperience,
    availability: r.availability,
    issued: r.issued,
    welcome: r.welcome,
    positioning: r.positioning,
    longBio: r.longBio ?? [],
    portraitAlt: r.portraitAlt ?? '',
    cvMediaId: cv?.id ?? null,
    portfolioMediaId: portfolio?.id ?? null,
    email: r.email,
    phone: r.phone,
    references: r.references ?? 'Available upon request',
  };

  await db.profile.upsert({
    where: { id: 'profile' },
    update: fields,
    create: { id: 'profile', ...fields },
  });

  /* Rewritten wholesale rather than merged. resume.json is authoritative, and a
     second run must not double every list. */
  await Promise.all([
    db.fact.deleteMany({}),
    db.socialLink.deleteMany({}),
    db.experienceEntry.deleteMany({}),
    db.educationEntry.deleteMany({}),
    db.skillGroup.deleteMany({}),
    db.language.deleteMany({}),
    db.resumeEntry.deleteMany({}),
  ]);

  await db.fact.createMany({
    data: AT_A_GLANCE.map((f, order) => ({ label: f.label, items: f.items, order })),
  });

  if ((r.social ?? []).length) {
    await db.socialLink.createMany({
      data: r.social.map((s, order) => ({ label: s.label, href: s.href, order })),
    });
  }

  await db.experienceEntry.createMany({
    data: (r.experience ?? []).map((e, order) => ({
      role: e.role,
      firm: e.firm,
      location: e.location,
      period: e.period,
      contributions: e.contributions ?? [],
      order,
    })),
  });

  await db.educationEntry.createMany({
    data: (r.education ?? []).map((e, order) => ({
      credential: e.credential,
      institution: e.institution,
      year: e.year ?? '',
      note: e.note ?? null,
      order,
    })),
  });

  for (const [order, group] of (r.skillGroups ?? []).entries()) {
    await db.skillGroup.create({
      data: {
        label: group.label,
        order,
        items: { create: (group.items ?? []).map((name, i) => ({ name, order: i })) },
      },
    });
  }

  await db.language.createMany({
    data: (r.languages ?? []).map((text, order) => ({ text, order })),
  });

  const entries = [];
  for (const section of ['volunteering', 'awards', 'publications', 'exhibitions']) {
    for (const [order, item] of (r[section] ?? []).entries()) {
      entries.push({
        section,
        title: item.title ?? String(item),
        detail: item.detail ?? '',
        year: item.year ?? '',
        order,
      });
    }
  }
  if (entries.length) await db.resumeEntry.createMany({ data: entries });

  console.log(
    `\nResume: ${r.experience?.length ?? 0} roles, ${r.education?.length ?? 0} qualifications, ` +
      `${r.skillGroups?.length ?? 0} skill groups, ${entries.length} other entries, ` +
      `${AT_A_GLANCE.length} at a glance blocks`,
  );
}

// ----------------------------------------------------------------- verify ---

async function verify() {
  const problems = [];

  const projects = await db.project.findMany({
    include: {
      leadImage: true,
      imageGroups: { include: { images: true } },
      drawings: true,
      film: { include: { sources: true } },
    },
  });

  if (projects.length === 0) problems.push('No projects were written.');

  for (const p of projects) {
    if (!p.leadImageId) problems.push(`${p.slug}: no lead image`);
    if (p.leadImageId && !p.leadImageAlt.trim()) problems.push(`${p.slug}: lead image has no alt text`);
    if (!p.credit.trim()) problems.push(`${p.slug}: no credit`);
    if (!/^A-\d{3}$/.test(p.sheet)) problems.push(`${p.slug}: sheet "${p.sheet}" is not A-nnn`);
    for (const group of p.imageGroups) {
      for (const image of group.images) {
        if (!image.alt.trim()) problems.push(`${p.slug}: an image in a ${group.layout} group has no alt text`);
      }
    }
  }

  const leads = projects.filter((p) => p.tier === 'lead').length;
  if (leads > 3) {
    console.log(
      `\n  Note: ${leads} projects are marked lead. Three lead and the rest fall through into the strip.`,
    );
  }

  const media = await db.media.findMany();
  if (!SKIP_UPLOAD) {
    let missing = 0;
    for (const m of media) {
      if (!(await objectExists(m.key))) {
        problems.push(`Media row ${m.key} has no object in the bucket`);
        missing += 1;
        if (missing > 10) {
          problems.push('... and more, stopping the check here');
          break;
        }
      }
    }
  }

  const hero = await db.film.findFirst({ where: { projectId: null }, include: { sources: true } });
  if (!hero) problems.push('No hero film');
  else if (hero.sources.length < 2) problems.push(`Hero film has ${hero.sources.length} encodes, expected 2`);

  const profile = await db.profile.findUnique({ where: { id: 'profile' } });
  if (!profile) problems.push('No profile row');

  return { problems, counts: { projects: projects.length, media: media.length } };
}

// ------------------------------------------------------------------- main ---

async function main() {
  console.log(`Database: ${connectionString().replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`Bucket:   ${BUCKET}${SKIP_UPLOAD ? '  (uploads skipped)' : ''}`);

  if (!VERIFY_ONLY) {
    await migrateProjects();
    await migrateHeroFilm();
    await migrateResume();
  }

  console.log(
    `\nMedia: ${stats.rowsWritten} rows, ${stats.uploaded} uploaded, ` +
      `${stats.alreadyInBucket} already in the bucket`,
  );
  if (stats.skipped.length) {
    console.log(`\n  ${stats.skipped.length} references had no file on disk:`);
    for (const s of stats.skipped.slice(0, 20)) console.log(`    ${s}`);
    if (stats.skipped.length > 20) console.log(`    ... and ${stats.skipped.length - 20} more`);
  }

  const { problems, counts } = await verify();

  console.log(`\nVerification: ${counts.projects} projects, ${counts.media} media rows`);
  if (problems.length) {
    console.log(`\nFAILED, ${problems.length} problems:`);
    for (const p of problems) console.log(`  ${p}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.');
  }
}

main()
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
