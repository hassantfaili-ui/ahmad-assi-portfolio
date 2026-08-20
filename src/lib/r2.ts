import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getR2Env } from './env';
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  validateUpload,
  type MediaKind,
} from './upload-policy';

/**
 * R2 over the S3 API.
 *
 * The shape here is the one already proven against Cloudflare R2 in the
 * Ahlulbayt Scouting codebase: region "auto", a per account endpoint, and
 * presigned URLs rather than a proxy. What matters about presigning is that the
 * bytes never pass through the Worker. Ahmad's largest render is 39.6MB and a
 * Worker has a request body limit an order of magnitude below the video he is
 * going to upload, so a proxied upload was never an option, not merely a slower
 * one.
 *
 * Nothing in this module reads the environment at load. See client() for why.
 */

/** Five minutes. Long enough for a slow connection to start, short enough that a leaked URL is stale by the time it is found. */
const DEFAULT_EXPIRY_SECONDS = 300;

/**
 * Built inside every call rather than once at module load.
 *
 * Two reasons, and both have teeth. On Workers the environment is only readable
 * inside a request, so a client constructed at import time would be constructed
 * with nothing. And route handlers importing this module are collected during
 * `next build`, where no credential is present: reading them eagerly turns a
 * missing variable into a build failure instead of a runtime error on the one
 * path that actually needs it.
 */
function client(): S3Client {
  const env = getR2Env();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // Not optional, and not obvious. Since v3.729 the SDK computes a checksum
    // for every PutObject by default, and on a presigned URL there is no body to
    // compute it over, so it hoists x-amz-checksum-crc32=AAAAAA== into the
    // signed query string: the CRC32 of nothing. R2 then compares that against
    // the file the browser really sent and refuses the upload. WHEN_REQUIRED
    // leaves it off, since S3 does not require a checksum on PutObject.
    // src/lib/r2.test.ts pins this, because the failure only shows up against a
    // real bucket with a real file.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
}

function sanitiseSegment(segment: string): string {
  return segment
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
}

/**
 * The stem and the extension are separated before either is sanitised, so a name
 * that is entirely punctuation still keeps whatever it was. "!!!.JPG" becomes
 * "file.jpg" rather than ".jpg", and a key whose extension disagreed with the
 * content type would confuse both Cloudflare Image Transformations and anyone
 * reading the bucket by hand.
 */
function sanitiseFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');

  const stem = sanitiseSegment(dot > 0 ? trimmed.slice(0, dot) : trimmed) || 'file';
  const extension = dot > 0 ? sanitiseSegment(trimmed.slice(dot + 1)).replace(/[^a-z0-9]/g, '') : '';

  return extension ? `${stem}.${extension}` : stem;
}

/**
 * A collision resistant object key under a prefix.
 *
 * The timestamp and the UUID are both there on purpose. The UUID is what makes
 * the key unique, since every export out of D5 is called Render.jpg and two of
 * them landing on the same key would silently replace an image a row already
 * points at. The timestamp is what makes the bucket readable: keys sort into
 * upload order, so a listing is a history.
 */
export function buildObjectKey(prefix: string, fileName: string): string {
  const name = `${Date.now()}-${randomUUID()}-${sanitiseFileName(fileName)}`;
  // Dot segments are dropped, not resolved. A prefix is a label under this
  // bucket, never a path with a parent, so '..' in one can only be an escape
  // attempt. Filtering it here keeps the "no key outside its prefix" guarantee
  // inside this function instead of resting on every caller validating first.
  const folder = prefix
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');

  return folder ? `${folder}/${name}` : name;
}

/**
 * The ceiling for each kind, restated from the private LIMITS table in
 * upload-policy.ts. The exported constants are the shared truth, so the two
 * tables can only ever differ in shape, not in size.
 */
const CEILINGS: Record<MediaKind, number> = {
  image: MAX_IMAGE_BYTES,
  video: MAX_VIDEO_BYTES,
  poster: MAX_IMAGE_BYTES,
  document: MAX_DOCUMENT_BYTES,
};

/**
 * Whether an object that actually landed is within the ceiling for its kind.
 *
 * validateUpload already judges size, but only as part of a verdict taken
 * before the bytes move, and a presigned PUT binds no length. So the size the
 * browser was validated against and the size R2 is now holding are two
 * different claims, and only the second one counts. This is the half the
 * complete route needs on its own, after HeadObject has reported the truth.
 * A kind this table does not recognise gets the smallest ceiling, because an
 * unrecognised kind is the client's word rather than a policy.
 */
export function sizeVerdict(
  kind: MediaKind,
  bytes: number,
): { ok: true } | { ok: false; limit: number } {
  const limit = CEILINGS[kind] ?? MAX_DOCUMENT_BYTES;
  return bytes > limit ? { ok: false, limit } : { ok: true };
}

/**
 * What a key's extension promises the object at it must be, or null when the
 * extension is not one the upload policy accepts.
 *
 * The complete route uses this to hold a landed object to the content type its
 * key was signed for, since the PUT itself cannot be held to it: content-type
 * is not in a presigned URL's SignedHeaders, so the uploader may send whatever
 * it likes and R2 will record it. The size passed here is a placeholder and
 * the reported type is left empty on purpose. At that point the stored type is
 * the claim being judged, so it cannot also be the evidence.
 */
export function keyExpectation(key: string): { kind: MediaKind; contentType: string } | null {
  const name = key.split('/').pop() || key;
  const verdict = validateUpload({ name, size: 1, type: '' });

  return verdict.ok ? { kind: verdict.kind, contentType: verdict.contentType } : null;
}

/**
 * A presigned PUT the browser uploads to directly.
 *
 * The uploader must send the same Content-Type, and nothing else: content-type
 * is unsignable in a presigned S3 URL, so it is not in SignedHeaders, but R2
 * still records it against the object and it is what HeadObject reports back.
 */
export async function getSignedUploadUrl(args: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const env = getR2Env();

  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: args.key,
      ContentType: args.contentType || 'application/octet-stream',
    }),
    { expiresIn: args.expiresIn ?? DEFAULT_EXPIRY_SECONDS },
  );
}

/**
 * A presigned GET.
 *
 * The public site never uses this: it reads through MEDIA_ORIGIN, which is a
 * cached public zone. This is for the administration area handing back an
 * original, where the stored key is a timestamp and a UUID and the readable
 * name has to travel in the disposition instead.
 */
export async function getSignedDownloadUrl(args: {
  key: string;
  fileName?: string;
  expiresIn?: number;
}): Promise<string> {
  const env = getR2Env();

  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: args.key,
      // Quotes stripped rather than escaped: a quote in the file name would
      // otherwise close the header value early and let the rest of the name act
      // as header parameters.
      ResponseContentDisposition: args.fileName
        ? `inline; filename="${args.fileName.replace(/"/g, '')}"`
        : undefined,
    }),
    { expiresIn: args.expiresIn ?? DEFAULT_EXPIRY_SECONDS },
  );
}

/** A 404 from HeadObject arrives as an exception. This is how to tell it apart from a real failure. */
function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const { name, $metadata } = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404;
}

/**
 * What R2 actually holds at a key, or null when it holds nothing.
 *
 * Null rather than a throw because the caller uses this to decide whether an
 * upload landed before it writes a Media row, and a missing object is an answer
 * to that question rather than a failure to answer it. Anything else is
 * rethrown: a wrong secret answers 403, and reporting that as "not there" would
 * mark every upload lost and send Ahmad looking for the fault in his browser.
 */
export async function headObject(
  key: string,
): Promise<{ bytes: number; contentType: string } | null> {
  const env = getR2Env();

  try {
    const head = await client().send(
      new HeadObjectCommand({ Bucket: env.bucket, Key: key }),
    );

    return {
      bytes: head.ContentLength ?? 0,
      contentType: head.ContentType ?? 'application/octet-stream',
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Deletes the object, and lets a failure through.
 *
 * The caller removes the object before the row for a reason: a failed delete
 * then leaves a row pointing at a file that is still there, which is a page that
 * still works. The other order leaves an object nothing points at, which nothing
 * will ever find again.
 */
export async function deleteObject(key: string): Promise<void> {
  const env = getR2Env();

  await client().send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  return (await headObject(key)) !== null;
}
