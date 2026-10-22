/**
 * The browser half of the upload path.
 *
 * Kept out of the React hook so the sequence can be read on its own: validate,
 * transcode if it is a film, ask for signed URLs, PUT straight to R2, then tell
 * the server what landed. The hook is only state and progress on top of this.
 */

import { transcodeVideo, canTranscode, TranscodeUnsupportedError } from '@/lib/transcode';
import { validateUpload, type MediaKind } from '@/lib/upload-policy';

export interface MediaRow {
  id: string;
  key: string;
  kind: MediaKind;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface PresignedUpload {
  name: string;
  key: string;
  /** One URL for the whole file. Absent when the file is sent in parts. */
  url?: string;
  /** A URL per part, in order, for a file over 16MB. */
  parts?: { uploadId: string; partSize: number; urls: string[] };
  contentType: string;
  kind: string;
}

/** What the complete route needs to join a file that went up in parts. */
export type MultipartReceipt = { uploadId: string; parts: number };

/**
 * Send one file the way the server signed it: whole, or part by part.
 *
 * The parts go one after another, each through putToR2 and so each with its
 * own retries, and the progress is the share of the file's bytes that have
 * landed. Returns what completeUpload needs to join the parts, or undefined for
 * a file sent whole.
 */
export async function sendUpload(
  upload: PresignedUpload,
  blob: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  onRetry?: (attempt: number, of: number) => void,
): Promise<MultipartReceipt | undefined> {
  if (!upload.parts) {
    if (!upload.url) throw new Error('The server did not say where to send the file.');
    await putToR2(upload.url, blob, upload.contentType, onProgress, signal, onRetry);
    return undefined;
  }

  const { uploadId, partSize, urls } = upload.parts;
  for (const [index, url] of urls.entries()) {
    const start = index * partSize;
    /* The last part takes whatever is left, so a blob a little larger than
       the size it was signed for still arrives whole rather than cut short. */
    const end = index === urls.length - 1 ? blob.size : start + partSize;
    const part = blob.slice(start, end);
    await putToR2(
      url,
      part,
      upload.contentType,
      (fraction) => onProgress(Math.min(1, (start + fraction * part.size) / blob.size)),
      signal,
      onRetry,
    );
  }
  return { uploadId, parts: urls.length };
}

export type UploadDestination = 'project' | 'film' | 'document' | 'profile';

/**
 * PUT one blob to a signed URL, reporting progress.
 *
 * XMLHttpRequest rather than fetch, and the reason is the progress bar. fetch
 * still has no upload progress event in any shipping browser, so a fetch based
 * version can only show an indeterminate spinner. On a 300MB film that is the
 * difference between a bar moving and an interface that looks frozen for four
 * minutes.
 */
/**
 * How many times one file is sent before the upload is called failed.
 *
 * Connections drop part way through a long PUT more often than it seems. On
 * 2026-10-22 half the 40 to 100MB uploads from Hassan's machine were cut off
 * after 27 to 42MB, to R2 and to Cloudflare's own speed test alike, and the
 * only way back was Try again, which compresses the whole film a second time.
 * A PUT is safe to repeat, so the file is simply sent again.
 */
export const PUT_ATTEMPTS = 4;

/** Waits between attempts: one second, then three, then nine. */
export function retryDelay(attempt: number): number {
  return 1000 * 3 ** (attempt - 1);
}

class RetryableUploadError extends Error {}

export async function putToR2(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  onRetry?: (attempt: number, of: number) => void,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await putOnce(url, blob, contentType, onProgress, signal);
    } catch (error) {
      /* Only a dropped connection or a server side failure is worth a second
         try. A 403 is an expired or wrong signature and will be a 403 again,
         and an abort is Ahmad pressing Cancel. */
      if (!(error instanceof RetryableUploadError) || attempt >= PUT_ATTEMPTS) {
        throw error instanceof RetryableUploadError ? new Error(error.message) : error;
      }
      onRetry?.(attempt + 1, PUT_ATTEMPTS);
      onProgress(0);
      await wait(retryDelay(attempt), signal);
    }
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function putOnce(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', contentType);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      const message = `The upload was refused with status ${request.status}.`;
      reject(request.status >= 500 ? new RetryableUploadError(message) : new Error(message));
    });

    request.addEventListener('error', () =>
      reject(new RetryableUploadError('The connection dropped during the upload.')),
    );
    request.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));

    signal?.addEventListener('abort', () => request.abort(), { once: true });

    request.send(blob);
  });
}

export async function requestPresigned(
  files: { name: string; size: number; type: string }[],
  destination: UploadDestination,
  slug?: string,
): Promise<{ uploads: PresignedUpload[]; rejected: { name: string; error: string }[] }> {
  const response = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files, prefix: destination, slug }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'Could not start the upload.');
  }

  return response.json();
}

export async function completeUpload(input: {
  key: string;
  name: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  multipart?: MultipartReceipt;
}): Promise<MediaRow> {
  const response = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'The upload could not be confirmed.');
  }

  const body = await response.json();
  return body.media as MediaRow;
}

/** Read an image's real dimensions, so next/image never has to guess. */
export function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

export { transcodeVideo, canTranscode, TranscodeUnsupportedError, validateUpload };
