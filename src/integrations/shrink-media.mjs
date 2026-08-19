import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Normalise oversized images on their way out of the build.
 *
 * Why this exists: Ahmad's exports are big. Measured across the source folders
 * he sent, the average photograph is 6.7MB, forty of them are over 5MB, and one
 * site map is 39.6MB at 7200x4800. The library in the repo today is nothing like
 * that only because every image in it was resized by hand before being committed.
 * Once he is uploading through the editor himself there is no such step, and the
 * site would happily serve a visitor a 39MB JPEG.
 *
 * So the build refuses to publish one. Anything past the ceiling is resized and
 * re-encoded on the way into dist. Nothing is asked of the person uploading, and
 * nothing can be forgotten.
 *
 * It works on dist, never on public. That is deliberate twice over. The originals
 * stay in the repo as masters, which is what scripts/build-portfolio.sh reads when
 * it makes the print copies for the PDF, and a build that only ever writes to its
 * own output cannot corrupt anything Ahmad uploaded.
 *
 * The thresholds are set so that nothing currently in the library is touched: the
 * existing 270 images are all within them, so this changes the site today by
 * exactly nothing and only ever acts on something genuinely too big.
 *
 * Failure is always a skip, never a thrown error. A single unreadable photograph
 * must not be able to take the whole site offline.
 */

/**
 * Width, in pixels. Width rather than longest edge, because width is what the
 * layout constrains and height just follows the aspect ratio. Capping the longest
 * edge instead looks equivalent and is not: it squashes anything legitimately
 * tall. The conference poster in the library is 2600x5162, and an edge cap turned
 * it into 1310x2600, throwing away half the resolution of a sheet whose whole
 * purpose is that you can read the text on it.
 */
const MAX_WIDTH = 2600;

/**
 * A second, generous guard for the pathological case a width cap cannot see, an
 * image that is narrow but enormously tall. Sixteen megapixels leaves the 13.4MP
 * poster comfortably clear.
 */
const MAX_PIXELS = 16e6;

/** Byte ceiling. Set above the largest image in the library, the poster at 2.01MB,
    so that every file in it today passes through untouched. */
const MAX_BYTES = 2.5 * 1024 * 1024;

const JPEG = { quality: 82, progressive: true, mozjpeg: true };

/* Photographic PNGs only shrink usefully with palette quantisation. Plain
   re-encoding at the highest compression measured *larger* than the source,
   which is why every result below is written only if it actually won. */
const PNG = { palette: true, quality: 80, compressionLevel: 9 };

const EXT = new Set(['.jpg', '.jpeg', '.png']);

/** Every file under a directory, recursively. Missing directory means nothing to do. */
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (EXT.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;

async function shrink(sharp, file) {
  const before = (await stat(file)).size;
  const buf = await readFile(file);

  /* limitInputPixels is off because one of his sections really is 29806px wide,
     and sharp's default guard rejects it outright. */
  const img = sharp(buf, { limitInputPixels: false, failOn: 'none' });
  const { width = 0, height = 0 } = await img.metadata();

  /* One scale factor satisfying both limits at once, never enlarging. */
  const scale = Math.min(
    1,
    MAX_WIDTH / (width || 1),
    Math.sqrt(MAX_PIXELS / ((width * height) || 1)),
  );
  if (scale === 1 && before <= MAX_BYTES) return null;

  const png = extname(file).toLowerCase() === '.png';
  const out = await img
    .rotate() // honour EXIF orientation before the dimensions are baked in
    .resize({ width: Math.max(1, Math.round(width * scale)), withoutEnlargement: true })
    [png ? 'png' : 'jpeg'](png ? PNG : JPEG)
    .toBuffer();

  /* The extension has to survive: dist is already written and the HTML in it
     refers to this exact filename. And a re-encode that came out bigger is not
     an improvement worth keeping. */
  if (out.length >= before) return null;

  await writeFile(file, out);
  return { file, before, after: out.length, width, height };
}

export default function shrinkMedia() {
  return {
    name: 'shrink-media',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let sharp;
        try {
          ({ default: sharp } = await import('sharp'));
        } catch {
          logger.warn('sharp unavailable, publishing images at their uploaded size');
          return;
        }

        /* fileURLToPath, not dir.pathname: this project lives in a directory with
           a space in its name, and pathname hands back the percent-encoded form,
           which readdir cannot open. That failure is silent, since a missing
           directory is a legitimate "nothing to do" here, so it is worth being
           explicit about. */
        const root = join(fileURLToPath(dir), 'media');
        /* When the films are served from object storage they must not also be
           published here. Left in place they are dead weight, and on a host with
           a per-file cap they fail the build even though nothing links to them:
           Cloudflare rejects any asset over 25 MiB and the hero is 42.8MB at
           full quality. Dropping them is what lets that quality be kept. */
        /* Films never ship in the bundle. They are kept in the repository at full
           bitrate, and the hero alone is 42.8MB against Cloudflare's 25 MiB cap
           on a single asset, so publishing them fails the build outright.

           Dropping them unconditionally rather than only when an origin is set
           is the difference between a soft failure and a hard one. Without an
           origin the site still builds and every page still works; only the film
           is missing, and the warning says why. Failing the whole deploy because
           one variable is unset punishes the wrong thing.

           Local development is unaffected: `astro dev` serves from public, not
           from dist, so the films play normally there either way. */
        const files = await walk(root);
        if (files.length === 0) {
          logger.warn(`no images found under ${root}`);
          return;
        }

        const done = [];
        /* A handful at a time. Sharp releases the event loop while it works, and
           a 7200x4800 resize is around 1.8s, so serial would be slow and all at
           once would fight for memory on a small build machine. */
        const queue = [...files];
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            for (let f = queue.pop(); f; f = queue.pop()) {
              try {
                const r = await shrink(sharp, f);
                if (r) done.push(r);
              } catch (err) {
                logger.warn(`could not shrink ${f.split('/media/')[1]}: ${err.message}`);
              }
            }
          }),
        );

        if (done.length === 0) {
          logger.info(`${files.length} images, all within ${MAX_WIDTH}px and ${mb(MAX_BYTES)}`);
          return;
        }

        const before = done.reduce((n, r) => n + r.before, 0);
        const after = done.reduce((n, r) => n + r.after, 0);
        for (const r of done.sort((a, b) => b.before - a.before).slice(0, 8)) {
          logger.info(
            `  ${mb(r.before)} -> ${mb(r.after)}  ${r.width}x${r.height}  ${r.file.split('/media/')[1]}`,
          );
        }
        logger.info(
          `shrank ${done.length} of ${files.length} images, ${mb(before)} -> ${mb(after)}`,
        );
      },
    },
  };
}
