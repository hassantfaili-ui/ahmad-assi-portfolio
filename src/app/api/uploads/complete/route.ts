import { NextResponse } from 'next/server';

import { requireIdentityOr401 } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { deleteObject, finishMultipartUpload, headObject, keyExpectation, sizeVerdict } from '@/lib/r2';
import { formatBytes, validateUpload, type MediaKind } from '@/lib/upload-policy';

/**
 * Confirm an object really landed, then write its row.
 *
 * The HEAD is not a formality. The browser uploads straight to R2, so this
 * server never saw the bytes and has only the browser's word that they arrived.
 * A cancelled tab, a dropped connection or a signature that expired mid transfer
 * all end with the client believing it succeeded. Writing the row on that word
 * alone produces a Media row pointing at nothing, which surfaces later as a
 * broken image on a live page with no clue how it got there.
 *
 * So: ask the bucket. If the object is not there, no row.
 */

export const runtime = 'nodejs';

interface CompleteRequest {
  key?: string;
  name?: string;
  kind?: MediaKind;
  width?: number;
  height?: number;
  durationSeconds?: number;
  /** Sent for a file that went up in parts, which are joined here first. */
  multipart?: { uploadId?: string; parts?: number };
}

const NOT_FINISHED =
  'That file did not finish uploading. Nothing was saved, so it is safe to drop it again.';

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorised = await requireIdentityOr401();
  if (unauthorised) return unauthorised;

  let body: CompleteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'That request was not JSON.' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ error: 'No object key was given.' }, { status: 400 });
  }

  const originalName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : key.split('/').pop() || key;

  /* A file sent in parts is not an object until its parts are joined, so the
     HEAD below would find nothing. Join them first; every check after that is
     made against the joined object exactly as it is for a single PUT. A part
     that never arrived, or an upload id R2 does not know, is an upload that did
     not finish. */
  if (body.multipart) {
    const uploadId = typeof body.multipart.uploadId === 'string' ? body.multipart.uploadId : '';
    const parts = positiveInt(body.multipart.parts);
    const joined =
      uploadId && parts
        ? await finishMultipartUpload({ key, uploadId, parts }).catch(() => false)
        : false;
    if (!joined) return NextResponse.json({ error: NOT_FINISHED }, { status: 409 });
  }

  const head = await headObject(key);
  if (!head) {
    return NextResponse.json({ error: NOT_FINISHED }, { status: 409 });
  }

  /* What the key was signed for. The extension in the key decided the content
     type at presign, so it is the standard the landed object is held to. */
  const expected = keyExpectation(key);

  /* The kind is re-derived from the name rather than taken from the request, for
     the same reason the content type is: the client is not the authority on what
     it just uploaded. */
  const verdict = validateUpload({ name: originalName, size: head.bytes, type: head.contentType });
  const kind: MediaKind = verdict.ok ? verdict.kind : (expected?.kind ?? body.kind ?? 'document');

  /* A presigned PUT binds no length, so the size the browser was validated
     against and the size R2 is now holding can be two different numbers. Only
     the real one counts, and an object over its ceiling is removed before any
     row can point at it. */
  const size = sizeVerdict(kind, head.bytes);
  if (!size.ok) {
    await deleteObject(key);
    return NextResponse.json(
      {
        error: `${originalName} arrived at ${formatBytes(head.bytes)}, which is over the ${formatBytes(size.limit)} limit for ${kind === 'document' ? 'a PDF' : `${kind} files`}. It has been removed, so nothing was saved. Export a smaller version and drop it again.`,
      },
      { status: 413 },
    );
  }

  /* Nothing holds the uploader to the content type the URL was signed for, so
     a .jpg URL can be used to store text/html, and the media domain would then
     serve a page that runs script. The extension already decided the type at
     presign; here the object itself is held to that decision, or removed. */
  if (expected && head.contentType !== expected.contentType) {
    await deleteObject(key);
    return NextResponse.json(
      {
        error: `${originalName} was uploaded as ${head.contentType}, but its name says it should be ${expected.contentType}. It has been removed, so nothing was saved. Export it in the format its name promises and drop it again.`,
      },
      { status: 415 },
    );
  }

  const media = await db.media.upsert({
    where: { key },
    update: {
      bytes: head.bytes,
      contentType: head.contentType,
      width: positiveInt(body.width),
      height: positiveInt(body.height),
      durationSeconds: Number.isFinite(Number(body.durationSeconds))
        ? Number(body.durationSeconds)
        : null,
    },
    create: {
      key,
      kind,
      contentType: head.contentType,
      bytes: head.bytes,
      originalName,
      width: positiveInt(body.width),
      height: positiveInt(body.height),
      durationSeconds: Number.isFinite(Number(body.durationSeconds))
        ? Number(body.durationSeconds)
        : null,
    },
  });

  return NextResponse.json({ media });
}
