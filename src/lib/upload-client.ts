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
  url: string;
  contentType: string;
  kind: string;
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
export function putToR2(
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
      reject(new Error(`The upload was refused with status ${request.status}.`));
    });

    request.addEventListener('error', () =>
      reject(new Error('The connection dropped during the upload.')),
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
