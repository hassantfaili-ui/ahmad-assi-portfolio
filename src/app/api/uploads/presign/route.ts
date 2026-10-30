import { NextResponse } from 'next/server';

import { requireIdentityOr401 } from '@/lib/api-auth';
import {
  buildObjectKey,
  getSignedUploadUrl,
  MULTIPART_THRESHOLD_BYTES,
  startMultipartUpload,
} from '@/lib/r2';
import { validateUpload } from '@/lib/upload-policy';

/**
 * Hand the browser a URL it can PUT straight to R2.
 *
 * The bytes never pass through the Worker. That is the whole point: a Worker
 * request body is capped, Ahmad's exports are not, and proxying a 300MB film
 * through a serverless function to put it in a bucket the function can already
 * address is work nobody needs done. It also means the 25 MiB published asset
 * ceiling that shaped the Astro site simply does not apply any more.
 *
 * The whole batch is signed in one call rather than one call per file, because
 * dropping thirty renders at once is the ordinary case and thirty round trips
 * before the first byte moves is a visible delay.
 *
 * A file over 16MB is handed a signed URL per 8MB part instead of one URL, so
 * that a connection dropping part way costs a part rather than the whole film.
 * See MULTIPART_THRESHOLD_BYTES in src/lib/r2.ts.
 */

export const runtime = 'nodejs';

/**
 * An hour. A signed URL is a capability, so it should not outlive its use, but
 * its use is not instant: a batch is signed in one call and then sent one file
 * after another, and a film's full size copy goes first. A 300MB walkthrough on
 * a 10 Mbps upload takes four minutes on its own, and ten minutes ran out
 * before the 720p and the poster behind it, or the last of thirty renders, had
 * started. Each URL still writes only its own key, at its own content type.
 */
const URL_LIFETIME_SECONDS = 3600;

/** More than one folder's worth in a single drop is a mistake, not a workflow. */
const MAX_FILES_PER_BATCH = 60;

interface RequestedFile {
  name: string;
  size: number;
  type: string;
}

export interface PresignedUpload {
  name: string;
  key: string;
  /** One URL for the whole file. Absent when the file is sent in parts. */
  url?: string;
  /** A URL per part, in order, for a file over the multipart threshold. */
  parts?: { uploadId: string; partSize: number; urls: string[] };
  contentType: string;
  kind: string;
}

export interface PresignResponse {
  uploads: PresignedUpload[];
  rejected: { name: string; error: string }[];
}

/**
 * Where the object lands. Chosen by the server from a small set, never taken
 * from the request: a prefix the caller controls is a path traversal waiting to
 * happen, and there is no reason the browser needs to decide this.
 */
const PREFIXES: Record<string, (slug?: string) => string> = {
  project: (slug) => `projects/${slug || 'unfiled'}`,
  film: () => 'media',
  document: () => 'documents',
  profile: () => 'profile',
};

/**
 * Mirrors SLUG_SHAPE in src/lib/slug.ts, which keeps it private. The comment on
 * PREFIXES promises the caller never controls the prefix, and a slug passed
 * through on a typeof check alone was quietly breaking that promise:
 * 'projects/../../x' is slug-typed and traversal-shaped at the same time.
 * buildObjectKey drops dot segments as a backstop, but a slug that fails this
 * shape was never made by this site, so it is refused rather than repaired.
 */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorised = await requireIdentityOr401();
  if (unauthorised) return unauthorised;

  let body: { files?: RequestedFile[]; prefix?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'That request was not JSON.' }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files were named.' }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return NextResponse.json(
      { error: `That is ${files.length} files at once. The limit is ${MAX_FILES_PER_BATCH}.` },
      { status: 400 },
    );
  }

  const buildPrefix = PREFIXES[body.prefix ?? 'project'];
  if (!buildPrefix) {
    return NextResponse.json({ error: 'Unknown upload destination.' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : undefined;
  if (slug !== undefined && !SLUG_SHAPE.test(slug)) {
    return NextResponse.json(
      { error: 'That project slug is not one this site could have made.' },
      { status: 400 },
    );
  }
  const prefix = buildPrefix(slug);

  const uploads: PresignedUpload[] = [];
  const rejected: { name: string; error: string }[] = [];

  for (const file of files) {
    const verdict = validateUpload({
      name: String(file?.name ?? ''),
      size: Number(file?.size ?? 0),
      type: String(file?.type ?? ''),
    });

    // One bad file does not fail the batch. Ahmad drops a folder, and being told
    // which single file was wrong while the other twenty nine upload is a far
    // better answer than being told to start again.
    if (!verdict.ok) {
      rejected.push({ name: String(file?.name ?? 'that file'), error: verdict.error });
      continue;
    }

    const key = buildObjectKey(prefix, file.name);
    const size = Number(file.size);
    uploads.push({
      name: file.name,
      key,
      ...(size > MULTIPART_THRESHOLD_BYTES
        ? {
            parts: await startMultipartUpload({
              key,
              contentType: verdict.contentType,
              bytes: size,
              expiresIn: URL_LIFETIME_SECONDS,
            }),
          }
        : {
            url: await getSignedUploadUrl({
              key,
              contentType: verdict.contentType,
              expiresIn: URL_LIFETIME_SECONDS,
            }),
          }),
      contentType: verdict.contentType,
      kind: verdict.kind,
    });
  }

  return NextResponse.json({ uploads, rejected } satisfies PresignResponse);
}
