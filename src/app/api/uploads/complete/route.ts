import { NextResponse } from 'next/server';

import { requireIdentityOr401 } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { headObject } from '@/lib/r2';
import { validateUpload, type MediaKind } from '@/lib/upload-policy';

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
}

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

  const head = await headObject(key);
  if (!head) {
    return NextResponse.json(
      {
        error:
          'That file did not finish uploading. Nothing was saved, so it is safe to drop it again.',
      },
      { status: 409 },
    );
  }

  /* The kind is re-derived from the name rather than taken from the request, for
     the same reason the content type is: the client is not the authority on what
     it just uploaded. */
  const verdict = validateUpload({ name: originalName, size: head.bytes, type: head.contentType });
  const kind: MediaKind = verdict.ok ? verdict.kind : (body.kind ?? 'document');

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
