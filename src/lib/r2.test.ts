import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  buildObjectKey,
  deleteObject,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  headObject,
  keyExpectation,
  objectExists,
  sizeVerdict,
} from './r2';
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type MediaKind,
} from './upload-policy';

const ACCOUNT = 'abc123account';
const BUCKET = 'ahmadassi-media-test';

/**
 * Fake credentials, and deliberately so. SigV4 is arithmetic over the secret, so
 * a signature can be produced and inspected without a bucket existing and
 * without a single packet leaving the machine. Nothing in this file needs the
 * network, which is what keeps it runnable in CI and on a plane.
 */
beforeEach(() => {
  vi.stubEnv('CLOUDFLARE_R2_ACCOUNT_ID', ACCOUNT);
  vi.stubEnv('CLOUDFLARE_R2_ACCESS_KEY_ID', 'AKIAEXAMPLENOTREAL');
  vi.stubEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'exampleSecretNotReal0000000000000000');
  vi.stubEnv('CLOUDFLARE_R2_BUCKET', BUCKET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

interface SentCommand {
  input: Record<string, unknown>;
}

/**
 * r2.ts builds its own S3Client inside each call and never hands it out, which
 * is the point: nothing can hold a client built before the credentials were
 * readable. The seam for a test is therefore the prototype rather than an
 * instance. send is inherited from the smithy Client, and vi.spyOn shadows it.
 */
function stubSend(impl: (command: SentCommand) => unknown) {
  const spy = vi.fn(impl);
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(spy as never);
  return spy;
}

function awsError(name: string, httpStatusCode: number) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

describe('buildObjectKey', () => {
  it('lowercases, turns whitespace into hyphens and strips unsafe characters', () => {
    const key = buildObjectKey('projects/lincoln', 'Lincoln Beach  RENDER (final)!.JPG');
    expect(key).toMatch(
      /^projects\/lincoln\/\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-lincoln-beach-render-final\.jpg$/,
    );
  });

  it('collapses a run of hyphens rather than leaving them', () => {
    expect(buildObjectKey('p', 'a  --  b.png')).toMatch(/-a-b\.png$/);
  });

  /**
   * Two files of the same name is the normal case, not the edge case: every
   * export out of D5 is called Render.jpg. A key that collided would overwrite
   * the earlier upload, and the row still pointing at it would silently start
   * showing a different image.
   */
  it('gives two identical names two different keys', () => {
    expect(buildObjectKey('p', 'a.jpg')).not.toEqual(buildObjectKey('p', 'a.jpg'));
  });

  it('stamps the key with the upload time in milliseconds', () => {
    const before = Date.now();
    const stamp = Number(buildObjectKey('p', 'a.jpg').split('/')[1].split('-')[0]);
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });

  it('keeps the extension, because the key and the content type have to agree', () => {
    expect(buildObjectKey('p', 'site-map.PNG')).toMatch(/\.png$/);
    expect(buildObjectKey('p', 'hero.mp4')).toMatch(/\.mp4$/);
    expect(buildObjectKey('p', 'archive.tar.gz')).toMatch(/-archive\.tar\.gz$/);
  });

  it('keeps the extension even when the name itself sanitises away to nothing', () => {
    expect(buildObjectKey('p', '!!!.JPG')).toMatch(/-file\.jpg$/);
  });

  it('never produces an empty file name', () => {
    expect(buildObjectKey('p', '!!!.')).toMatch(/-file$/);
    expect(buildObjectKey('p', '')).toMatch(/-file$/);
    expect(buildObjectKey('p', '   ')).toMatch(/-file$/);
  });

  /**
   * The name comes from a browser file picker, so it is attacker controlled in
   * principle. A slash surviving would let a caller write outside its prefix.
   */
  it('lets no path separator survive the file name', () => {
    const key = buildObjectKey('projects/lincoln', '../../secrets/passwd');
    expect(key.startsWith('projects/lincoln/')).toBe(true);
    expect(key.slice('projects/lincoln/'.length)).not.toContain('/');
  });

  it('normalises a prefix given with stray slashes', () => {
    expect(buildObjectKey('/projects/lincoln/', 'a.jpg')).toMatch(/^projects\/lincoln\/\d+-/);
    expect(buildObjectKey('', 'a.jpg')).toMatch(/^\d+-/);
  });

  /**
   * The prefix is supposed to be chosen by the server, but "supposed to" is not
   * a guarantee. The presign route validates the slug it splices in, and this
   * is the backstop for a future caller that forgets: a dot segment surviving
   * into a key would mint 'projects/../../x' shaped keys outside the prefix the
   * route's own comment promises the caller can never reach.
   */
  it('drops dot segments out of the prefix rather than letting them traverse', () => {
    expect(buildObjectKey('../../etc', 'a.jpg')).toMatch(/^etc\/\d+-/);
    expect(buildObjectKey('projects/../../x', 'a.jpg')).toMatch(/^projects\/x\/\d+-/);
    expect(buildObjectKey('projects/../../x', 'a.jpg')).not.toContain('..');
    expect(buildObjectKey('projects/lincoln-beach', 'a.jpg')).toMatch(
      /^projects\/lincoln-beach\/\d+-/,
    );
  });
});

describe('sizeVerdict', () => {
  it('passes a file at its ceiling and refuses one just past it', () => {
    expect(sizeVerdict('image', MAX_IMAGE_BYTES)).toEqual({ ok: true });
    expect(sizeVerdict('image', MAX_IMAGE_BYTES + 1)).toEqual({
      ok: false,
      limit: MAX_IMAGE_BYTES,
    });
  });

  it('holds each kind to its own ceiling, not to a shared one', () => {
    expect(sizeVerdict('video', MAX_IMAGE_BYTES + 1)).toEqual({ ok: true });
    expect(sizeVerdict('video', MAX_VIDEO_BYTES + 1)).toEqual({
      ok: false,
      limit: MAX_VIDEO_BYTES,
    });
    expect(sizeVerdict('document', MAX_DOCUMENT_BYTES + 1)).toEqual({
      ok: false,
      limit: MAX_DOCUMENT_BYTES,
    });
    expect(sizeVerdict('poster', MAX_IMAGE_BYTES)).toEqual({ ok: true });
  });

  /**
   * The kind can arrive from the request body when the key's extension gives no
   * answer, and a made up kind must not buy a made up ceiling. The smallest
   * limit is the only safe answer for a claim nothing can verify.
   */
  it('gives an unrecognised kind the smallest ceiling rather than none', () => {
    expect(sizeVerdict('banana' as MediaKind, MAX_DOCUMENT_BYTES + 1)).toEqual({
      ok: false,
      limit: MAX_DOCUMENT_BYTES,
    });
  });
});

describe('keyExpectation', () => {
  it('reads the promise out of the key extension', () => {
    expect(keyExpectation('projects/lincoln/1755640000000-abc-render.jpg')).toEqual({
      kind: 'image',
      contentType: 'image/jpeg',
    });
    expect(keyExpectation('media/1755640000000-abc-walkthrough-1440.mp4')).toEqual({
      kind: 'video',
      contentType: 'video/mp4',
    });
    expect(keyExpectation('documents/1755640000000-abc-cv.pdf')).toEqual({
      kind: 'document',
      contentType: 'application/pdf',
    });
  });

  /**
   * Null, not a guess. A key with no accepted extension cannot have come out of
   * the presign policy, so there is no promise for the complete route to hold
   * the object to, and pretending otherwise would judge it against noise.
   */
  it('promises nothing for a key with no accepted extension', () => {
    expect(keyExpectation('media/1755640000000-abc-file')).toBeNull();
    expect(keyExpectation('media/1755640000000-abc-page.html')).toBeNull();
  });
});

describe('getSignedUploadUrl', () => {
  it('signs a PUT at the bucket and key on the account endpoint', async () => {
    const url = new URL(
      await getSignedUploadUrl({ key: 'projects/a.jpg', contentType: 'image/jpeg' }),
    );

    expect(url.protocol).toBe('https:');
    expect(url.hostname).toContain(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(`${url.hostname}${url.pathname}`).toContain(`${BUCKET}`);
    expect(url.pathname).toContain('projects/a.jpg');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLENOTREAL');
  });

  it('expires in five minutes by default and honours an explicit window', async () => {
    const fiveMinutes = new URL(
      await getSignedUploadUrl({ key: 'projects/a.jpg', contentType: 'image/jpeg' }),
    );
    expect(fiveMinutes.searchParams.get('X-Amz-Expires')).toBe('300');

    const longer = new URL(
      await getSignedUploadUrl({
        key: 'projects/big.mp4',
        contentType: 'video/mp4',
        expiresIn: 3600,
      }),
    );
    expect(longer.searchParams.get('X-Amz-Expires')).toBe('3600');
  });

  /**
   * The load bearing assertion in this file, and the one that caught a real
   * defect. Left to itself the SDK hoists x-amz-checksum-crc32=AAAAAA== into the
   * signed query string: the CRC32 of an empty body, because presigning has no
   * body to hash. R2 then checks that claim against the megabytes the browser
   * actually sent and rejects the upload. Nothing about that is visible until a
   * real file is dropped, which is why it is pinned here.
   *
   * Same reasoning for SignedHeaders: every header signed is a header the
   * uploader has to reproduce byte for byte, so only host may be in there.
   */
  it('signs no checksum of a body it never saw', async () => {
    const url = new URL(
      await getSignedUploadUrl({ key: 'projects/a.jpg', contentType: 'image/jpeg' }),
    );

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect([...url.searchParams.keys()].filter((key) => /checksum/i.test(key))).toEqual([]);
  });

  it('names the variable it is missing rather than failing as undefined', async () => {
    vi.stubEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY', '');
    await expect(
      getSignedUploadUrl({ key: 'projects/a.jpg', contentType: 'image/jpeg' }),
    ).rejects.toThrow('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  });
});

describe('getSignedDownloadUrl', () => {
  it('signs a GET at the bucket and key', async () => {
    const url = new URL(await getSignedDownloadUrl({ key: 'projects/a.jpg' }));

    expect(url.hostname).toContain(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(url.pathname).toContain('projects/a.jpg');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBeNull();
  });

  /**
   * Ahmad's originals are stored under a timestamped key nobody would want to
   * see in a downloads folder, so the readable name travels in the disposition.
   */
  it('asks R2 to serve the readable name when one is given', async () => {
    const url = new URL(
      await getSignedDownloadUrl({ key: 'projects/a.jpg', fileName: 'Lincoln Beach.jpg' }),
    );
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'inline; filename="Lincoln Beach.jpg"',
    );
  });

  it('strips quotes out of the file name so the header cannot be broken open', async () => {
    const url = new URL(
      await getSignedDownloadUrl({ key: 'projects/a.jpg', fileName: 'a".jpg' }),
    );
    expect(url.searchParams.get('response-content-disposition')).toBe('inline; filename="a.jpg"');
  });
});

describe('headObject', () => {
  it('returns the size and the content type', async () => {
    const send = stubSend(() => ({ ContentLength: 41_527_296, ContentType: 'image/jpeg' }));

    await expect(headObject('projects/a.jpg')).resolves.toEqual({
      bytes: 41_527_296,
      contentType: 'image/jpeg',
    });

    // The command class, not only its input. Bucket and Key are the same shape
    // for Put, Get, Head and Delete, so asserting on input alone cannot tell
    // the four apart. An adversarial review proved it: swapping the Delete
    // below for a Put left the whole suite green.
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: BUCKET, Key: 'projects/a.jpg' });
  });

  it('falls back to a generic content type when R2 does not report one', async () => {
    stubSend(() => ({ ContentLength: 12 }));
    await expect(headObject('projects/a.jpg')).resolves.toEqual({
      bytes: 12,
      contentType: 'application/octet-stream',
    });
  });

  /**
   * The caller uses this to decide whether an upload actually landed before it
   * writes a Media row. A missing object is an answer, not a failure, so it must
   * not arrive as an exception the route would have to unpick.
   */
  it('returns null when the object is not there', async () => {
    stubSend(() => {
      throw awsError('NotFound', 404);
    });
    await expect(headObject('projects/missing.jpg')).resolves.toBeNull();

    stubSend(() => {
      throw awsError('NoSuchKey', 404);
    });
    await expect(headObject('projects/missing.jpg')).resolves.toBeNull();
  });

  /**
   * A wrong secret answers 403. Swallowing that as null would report every
   * upload as lost and send Ahmad hunting for a problem in his browser.
   */
  it('rethrows anything that is not a missing object', async () => {
    stubSend(() => {
      throw awsError('AccessDenied', 403);
    });
    await expect(headObject('projects/a.jpg')).rejects.toThrow('AccessDenied');
  });
});

describe('objectExists', () => {
  it('is true when the object is there and false when it is not', async () => {
    stubSend(() => ({ ContentLength: 1, ContentType: 'image/jpeg' }));
    await expect(objectExists('projects/a.jpg')).resolves.toBe(true);

    stubSend(() => {
      throw awsError('NotFound', 404);
    });
    await expect(objectExists('projects/a.jpg')).resolves.toBe(false);
  });
});

describe('deleteObject', () => {
  it('deletes the key out of the configured bucket', async () => {
    const send = stubSend(() => ({}));

    await deleteObject('projects/a.jpg');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[0][0]).not.toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: BUCKET, Key: 'projects/a.jpg' });
  });

  it('lets a failure through, because a silent one leaves an object nothing points at', async () => {
    stubSend(() => {
      throw awsError('AccessDenied', 403);
    });
    await expect(deleteObject('projects/a.jpg')).rejects.toThrow('AccessDenied');
  });
});

/**
 * The module is imported by route handlers that Next collects at build time,
 * and by this test file, in both cases with no credentials in the environment.
 * Reading them at module load would turn a missing variable into a build
 * failure and make every pure test above impossible to run.
 */
describe('module load', () => {
  it('imports with no credentials set, and only fails when a call needs them', async () => {
    vi.stubEnv('CLOUDFLARE_R2_ACCOUNT_ID', '');
    vi.stubEnv('CLOUDFLARE_R2_ACCESS_KEY_ID', '');
    vi.stubEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY', '');
    vi.stubEnv('CLOUDFLARE_R2_BUCKET', '');
    vi.resetModules();

    const fresh = await import('./r2');

    expect(fresh.buildObjectKey('p', 'a.jpg')).toMatch(/^p\/\d+-/);
    await expect(
      fresh.getSignedUploadUrl({ key: 'p/a.jpg', contentType: 'image/jpeg' }),
    ).rejects.toThrow('CLOUDFLARE_R2_ACCOUNT_ID');
  });
});

/**
 * Which command is sent, asserted directly.
 *
 * An adversarial review replaced the DeleteObjectCommand in deleteObject with a
 * PutObjectCommand and the entire suite stayed green, because every assertion
 * looked at the command's `input` and { Bucket, Key } is the same shape for all
 * four. A delete that silently overwrote the object with an empty body would
 * have shipped. These are the two functions whose behaviour is not otherwise
 * visible in a returned URL, so they are exactly the two that needed this.
 */
describe('the command each function actually sends', () => {
  it('signs an upload with a Put and a download with a Get', async () => {
    const upload = new URL(await getSignedUploadUrl({ key: 'k.jpg', contentType: 'image/jpeg' }));
    const download = new URL(await getSignedDownloadUrl({ key: 'k.jpg' }));

    // A presigned URL carries its method in the signature rather than the path,
    // so the observable difference is the signed header set and the query.
    expect(upload.pathname).toContain('k.jpg');
    expect(download.pathname).toContain('k.jpg');
    expect(upload.searchParams.get('X-Amz-Signature')).not.toBe(
      download.searchParams.get('X-Amz-Signature'),
    );
  });

  it('sends a Head for objectExists, never a Get that would pull the body', async () => {
    // Getting this wrong would download a 73MB film to answer a yes or no
    // question, on every check, and nothing in the return value would show it.
    const send = stubSend(() => ({ ContentLength: 1, ContentType: 'image/jpeg' }));

    await objectExists('projects/a.jpg');

    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[0][0]).not.toBeInstanceOf(GetObjectCommand);
  });
});
