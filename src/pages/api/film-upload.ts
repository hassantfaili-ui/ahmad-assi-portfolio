/**
 * A signed upload slot in the film bucket.
 *
 * Films are the one thing on this site that cannot be committed. The hero is
 * 42.8MB, a single save through the editor is capped at 45MB by GitHub's own
 * API, and Cloudflare refuses to serve any one asset over 25 MiB. They already
 * live in R2 and are already served from media.ahmadassi.ca; this is what lets
 * Ahmad put one there without a terminal.
 *
 * WHY A SIGNED URL RATHER THAN AN UPLOAD. The browser sends the file straight to
 * Cloudflare and never through this Worker. A Worker request body is capped well
 * below the size of a 4K master, and proxying one would spend the site's compute
 * on moving bytes that R2 will happily accept directly. So this route only ever
 * handles a few hundred bytes of JSON: it signs a PUT and hands the URL back.
 *
 * WHY A PASSPHRASE. Anything that mints write access to a bucket has to be shut,
 * and this route cannot see Tina's session: the admin is a static SPA that
 * authenticates against TinaCloud, not against this site, so there is nothing
 * here to check it against. A shared passphrase held as a Worker secret is the
 * honest version of the guarantee that is actually available, and it is checked
 * in constant time so the answer cannot be guessed a character at a time.
 *
 * WHEN IT IS NOT CONFIGURED it answers 501 and says so, and the editor's film
 * field turns itself into a plain text box. A clone of this repository with no
 * bucket still gets a working editor and a working site.
 */
import type { APIRoute } from 'astro';
import { AwsClient } from 'aws4fetch';
/* The Worker's own bindings and variables. Astro 6 removed
   `Astro.locals.runtime.env`, and this is what replaced it: the adapter resolves
   `cloudflare:workers` in both `astro dev` and the deployed Worker, and this
   route never runs anywhere else, because it is the one route that is not
   prerendered. */
import { env as workerEnv } from 'cloudflare:workers';

export const prerender = false;

/** How long a signed PUT stays usable. Long enough for a big file on a slow
    connection, short enough that a leaked URL is not a standing invitation. */
const EXPIRY_SECONDS = 60 * 60;

/** Ceiling on a single film, well above the 42.8MB hero and below anything that
    would be a mistake. Enforced at signing time, since R2 will take whatever the
    signature allows once the URL is out. */
const MAX_BYTES = 512 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * The bucket keys have to stay under `media/`, because that is the path the site
 * asks for: filmUrl() in src/lib/url.ts joins the media origin to /media/<name>.
 * A film written anywhere else in the bucket is simply not reachable.
 */
const PREFIX = 'media/';

/** Named for what it is, rather than `Env`, which is the global name wrangler
    generates for a Worker's whole environment. */
interface UploadEnv {
  R2_ACCOUNT_ID?: string;
  R2_BUCKET?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  FILM_UPLOAD_KEY?: string;
}

/**
 * Worker secrets first, then whatever the build baked in.
 *
 * Secrets are set on the Worker and arrive through `cloudflare:workers`, not on
 * process.env. Reading only process.env is the mistake that makes this work
 * perfectly in `npm run dev` and answer 501 in production, so both are read and
 * the Worker wins. Locally, `.dev.vars` is what populates the first of them.
 */
function readEnv(): UploadEnv {
  const runtime = (workerEnv ?? {}) as Record<string, string | undefined>;
  const build = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const pick = (key: keyof UploadEnv) => runtime[key] || build[key] || process.env?.[key];
  return {
    R2_ACCOUNT_ID: pick('R2_ACCOUNT_ID'),
    R2_BUCKET: pick('R2_BUCKET'),
    R2_ACCESS_KEY_ID: pick('R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: pick('R2_SECRET_ACCESS_KEY'),
    FILM_UPLOAD_KEY: pick('FILM_UPLOAD_KEY'),
  };
}

function configured(env: UploadEnv): env is Required<UploadEnv> {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.FILM_UPLOAD_KEY,
  );
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const NOT_CONFIGURED = {
  error:
    'Film uploads are not switched on for this site. See docs/EDITING.md for the ' +
    'five variables the bucket needs.',
};

/** Compares without leaking where two strings first differ. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A safe object key built from what Ahmad called the file.
 *
 * His own name is kept, tidied, so the bucket stays readable next to the copies
 * in public/media. The random suffix is what makes it safe to keep: uploading a
 * second cut of the same film cannot quietly overwrite the one the site is
 * serving while a visitor is halfway through watching it.
 */
function keyFor(filename: string, contentType: string): string {
  const stem =
    filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'film';
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${PREFIX}${stem}-${suffix}.${EXTENSIONS[contentType] ?? 'mp4'}`;
}

/** Whether uploading is available at all. The editor asks before it offers a
    button, so the field can present itself honestly rather than failing on use. */
export const GET: APIRoute = () => {
  const env = readEnv();
  return configured(env) ? json({ ok: true }, 200) : json(NOT_CONFIGURED, 501);
};

export const POST: APIRoute = async ({ request }) => {
  const env = readEnv();
  if (!configured(env)) return json(NOT_CONFIGURED, 501);

  const offered = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!offered || !sameSecret(offered, env.FILM_UPLOAD_KEY)) {
    return json({ error: 'Wrong passphrase.' }, 401);
  }

  let body: { filename?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const filename = typeof body.filename === 'string' ? body.filename : '';
  const contentType = typeof body.contentType === 'string' ? body.contentType : '';
  const size = typeof body.size === 'number' ? body.size : 0;

  if (!filename) return json({ error: 'No filename.' }, 400);
  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: `${contentType || 'That file'} is not a film. Use MP4, WebM or MOV.` }, 415);
  }
  if (size <= 0 || size > MAX_BYTES) {
    return json({ error: `A film has to be under ${Math.round(MAX_BYTES / 1048576)}MB.` }, 413);
  }

  const key = keyFor(filename, contentType);
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;

  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  /* Signed into the query string rather than a header, because the browser sends
     these bytes itself and cannot be asked to reproduce a signed Authorization
     header it never computed. */
  const signed = await aws.sign(
    new Request(`${endpoint}?X-Amz-Expires=${EXPIRY_SECONDS}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    }),
    { aws: { signQuery: true } },
  );

  /* The path, not the URL. Content files hold /media/<name> and filmUrl() puts
     the bucket's own domain in front at render time, so the same file works
     whether it is served from R2 or from this site. */
  return json({ url: signed.url, path: `/${key}` }, 200);
};
