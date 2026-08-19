import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

/**
 * Media off local disk, in development only.
 *
 * Published media lives in R2 and is served from the bucket's own domain. That
 * is right in production and useless while developing: it means nobody can run
 * this repository and see the actual site without R2 credentials, and it meant
 * every image on every page failed with ERR_NAME_NOT_RESOLVED the first time the
 * rebuilt site was opened, because the custom domain the old documentation
 * claimed was attached had in fact never been created.
 *
 * The originals are still in the repository, under public/media and media, so
 * this maps an object key back to the file the migration would have uploaded
 * from and serves it. That makes `npm run dev` work with nothing configured.
 *
 * It refuses to run outside development. Reading arbitrary files off the
 * filesystem is not something to leave switched on by accident, and the guard
 * is a 404 rather than an error so it cannot be probed for.
 */

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  pdf: 'application/pdf',
};

/**
 * An object key, back to the files it was uploaded from.
 *
 * The mapping mirrors keyForContentPath in scripts/migrate-content.mjs, in the
 * other direction. Several candidates per key because the films are masters
 * kept outside public/ on purpose, and the two PDFs were served from their own
 * folders before they became documents/.
 */
function candidatesFor(key: string): string[] {
  const root = process.cwd();
  const parts = key.split('/');
  const name = parts[parts.length - 1];

  if (parts[0] === 'projects' && parts.length >= 3) {
    return [join(root, 'public', 'media', ...parts.slice(1))];
  }

  if (parts[0] === 'media') {
    return [
      join(root, 'media', name),
      join(root, 'public', 'media', name),
    ];
  }

  if (parts[0] === 'documents') {
    return [
      join(root, 'public', 'cv', name),
      join(root, 'public', 'portfolio', name),
      join(root, 'public', 'documents', name),
    ];
  }

  return [join(root, 'public', key)];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { key } = await context.params;
  const joined = key.join('/');

  /* Normalised and then confined to the repository. A key is attacker
     controlled in principle, and ../../ out of the working directory is the
     one thing this must not do even in development. */
  const safe = normalize(joined).replace(/^(\.\.(\/|\\|$))+/, '');
  const root = resolve(process.cwd());

  const found = candidatesFor(safe).find(
    (candidate) => resolve(candidate).startsWith(root) && existsSync(candidate),
  );

  if (!found) {
    return new NextResponse(`No local file for ${safe}`, { status: 404 });
  }

  const info = statSync(found);
  const extension = found.split('.').pop()?.toLowerCase() ?? '';

  return new NextResponse(Readable.toWeb(createReadStream(found)) as ReadableStream, {
    headers: {
      'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'content-length': String(info.size),
      'cache-control': 'no-store',
    },
  });
}
