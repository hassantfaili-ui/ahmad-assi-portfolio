import { NextResponse } from 'next/server';

import { requireIdentityOr401 } from '@/lib/api-auth';
import { buildObjectKey, getSignedUploadUrl } from '@/lib/r2';
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
 */

export const runtime = 'nodejs';

/** Deliberately short. A signed URL is a capability, and this one is used at once. */
const URL_LIFETIME_SECONDS = 600;

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
  url: string;
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
  const prefix = buildPrefix(typeof body.slug === 'string' ? body.slug : undefined);

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
    uploads.push({
      name: file.name,
      key,
      url: await getSignedUploadUrl({
        key,
        contentType: verdict.contentType,
        expiresIn: URL_LIFETIME_SECONDS,
      }),
      contentType: verdict.contentType,
      kind: verdict.kind,
    });
  }

  return NextResponse.json({ uploads, rejected } satisfies PresignResponse);
}
