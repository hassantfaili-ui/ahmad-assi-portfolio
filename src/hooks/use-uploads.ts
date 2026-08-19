'use client';

import { useCallback, useRef, useState } from 'react';

import {
  canTranscode,
  completeUpload,
  putToR2,
  readImageSize,
  requestPresigned,
  transcodeVideo,
  validateUpload,
  type MediaRow,
  type UploadDestination,
} from '@/lib/upload-client';

/**
 * The upload queue.
 *
 * One dropped file is one row in the interface, even when it becomes three
 * objects in the bucket. A film produces a 1440p encode, a 720p encode and a
 * poster frame, and Ahmad dropped one thing: showing him three progress bars
 * for it would be an accurate description of the implementation and a confusing
 * description of what he did.
 */

export type UploadStage =
  | 'queued'
  | 'compressing'
  | 'uploading'
  | 'finishing'
  | 'done'
  | 'failed';

export interface UploadedImage {
  kind: 'image' | 'document';
  media: MediaRow;
}

export interface UploadedFilm {
  kind: 'film';
  sources: { height: number; media: MediaRow }[];
  poster: MediaRow;
  durationSeconds: number;
}

export type UploadedItem = UploadedImage | UploadedFilm;

export interface UploadRow {
  id: string;
  name: string;
  bytes: number;
  stage: UploadStage;
  /** 0 to 1 across everything this file has to do, not just the transfer. */
  progress: number;
  label: string;
  error?: string;
  result?: UploadedItem;
}

let nextId = 0;

export interface UseUploadsOptions {
  destination: UploadDestination;
  slug?: string;
  /** 'hero' discards audio and encodes smaller. See src/lib/transcode.ts. */
  filmProfile?: 'hero' | 'walkthrough';
  onUploaded?: (items: UploadedItem[]) => void;
}

export function useUploads({ destination, slug, filmProfile = 'walkthrough', onUploaded }: UseUploadsOptions) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const files = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, AbortController>());

  const patch = useCallback((id: string, changes: Partial<UploadRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }, []);

  const runSingle = useCallback(
    async (
      id: string,
      file: File,
      kind: 'image' | 'document' | 'poster',
      signal: AbortSignal,
    ): Promise<UploadedItem | null> => {
      patch(id, { stage: 'uploading', progress: 0, label: 'Uploading' });

      const { uploads, rejected } = await requestPresigned(
        [{ name: file.name, size: file.size, type: file.type }],
        destination,
        slug,
      );

      if (rejected.length > 0 || uploads.length === 0) {
        patch(id, {
          stage: 'failed',
          label: 'Refused',
          error: rejected[0]?.error ?? 'The server refused that file.',
        });
        return null;
      }

      const [upload] = uploads;
      await putToR2(upload.url, file, upload.contentType, (fraction) => {
        patch(id, { progress: fraction * 0.95, label: 'Uploading' });
      }, signal);

      patch(id, { stage: 'finishing', progress: 0.97, label: 'Finishing' });

      const size = kind === 'image' ? await readImageSize(file) : null;
      const media = await completeUpload({
        key: upload.key,
        name: file.name,
        width: size?.width,
        height: size?.height,
      });

      patch(id, { stage: 'done', progress: 1, label: 'Done' });
      return { kind: kind === 'document' ? 'document' : 'image', media };
    },
    [patch, destination, slug],
  );

  const runFilm = useCallback(
    async (id: string, file: File, signal: AbortSignal): Promise<UploadedItem | null> => {
      patch(id, { stage: 'compressing', progress: 0, label: 'Compressing' });

      /* Compression is the long half, so it gets most of the bar. Splitting it
         evenly would leave the bar still for minutes and then jump, which reads
         as a hang rather than as progress. */
      const COMPRESS_SHARE = 0.6;

      const result = await transcodeVideo(file, {
        profile: filmProfile,
        signal,
        onProgress: ({ fraction, label }) =>
          patch(id, { progress: fraction * COMPRESS_SHARE, label }),
      });

      const base = file.name.replace(/\.[^.]+$/, '');
      const parts = [
        ...result.encodes.map((encode) => ({
          name: `${base}-${encode.height}.mp4`,
          blob: encode.blob,
          height: encode.height as number,
        })),
        { name: `${base}-poster.jpg`, blob: result.poster, height: 0 },
      ];

      patch(id, { stage: 'uploading', label: 'Uploading' });

      const { uploads, rejected } = await requestPresigned(
        parts.map((part) => ({ name: part.name, size: part.blob.size, type: part.blob.type })),
        'film',
      );

      if (rejected.length > 0 || uploads.length !== parts.length) {
        patch(id, {
          stage: 'failed',
          label: 'Refused',
          error: rejected[0]?.error ?? 'The server refused one of the encodes.',
        });
        return null;
      }

      const uploadShare = (1 - COMPRESS_SHARE - 0.05) / parts.length;
      const rows: MediaRow[] = [];

      for (const [index, part] of parts.entries()) {
        const upload = uploads[index];
        await putToR2(upload.url, part.blob, upload.contentType, (fraction) => {
          patch(id, {
            progress: COMPRESS_SHARE + index * uploadShare + fraction * uploadShare,
            label: part.height ? `Uploading ${part.height}p` : 'Uploading the poster',
          });
        }, signal);

        rows.push(
          await completeUpload({
            key: upload.key,
            name: part.name,
            durationSeconds: part.height ? result.durationSeconds : undefined,
          }),
        );
      }

      patch(id, { stage: 'done', progress: 1, label: 'Done' });

      return {
        kind: 'film',
        sources: result.encodes.map((encode, index) => ({
          height: encode.height,
          media: rows[index],
        })),
        poster: rows[rows.length - 1],
        durationSeconds: result.durationSeconds,
      };
    },
    [patch, filmProfile],
  );

  const runOne = useCallback(
    async (id: string, file: File): Promise<UploadedItem | null> => {
      const controller = new AbortController();
      aborts.current.set(id, controller);

      try {
        const verdict = validateUpload({ name: file.name, size: file.size, type: file.type });
        if (!verdict.ok) {
          patch(id, { stage: 'failed', error: verdict.error, progress: 0, label: 'Refused' });
          return null;
        }

        if (verdict.kind === 'video') {
          // Refused rather than uploaded raw. Falling back to the original would
          // be invisible here and paid for by every visitor on a phone.
          if (!canTranscode()) {
            patch(id, {
              stage: 'failed',
              progress: 0,
              label: 'Refused',
              error:
                'This browser cannot compress video. Use Chrome, Edge, or Safari 16.4 or newer to upload a film.',
            });
            return null;
          }
          return await runFilm(id, file, controller.signal);
        }

        return await runSingle(id, file, verdict.kind, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          patch(id, { stage: 'failed', error: 'Cancelled.', label: 'Cancelled' });
          return null;
        }
        patch(id, {
          stage: 'failed',
          label: 'Failed',
          error: error instanceof Error ? error.message : 'Something went wrong.',
        });
        return null;
      } finally {
        aborts.current.delete(id);
      }
    },
    [patch, runFilm, runSingle],
  );

  const add = useCallback(
    async (incoming: File[]) => {
      const queued = incoming.map((file) => {
        const id = `upload-${nextId++}`;
        files.current.set(id, file);
        return {
          row: {
            id,
            name: file.name,
            bytes: file.size,
            stage: 'queued' as const,
            progress: 0,
            label: 'Waiting',
          },
          file,
        };
      });

      setRows((current) => [...current, ...queued.map((q) => q.row)]);

      /* Sequential, not parallel. Twenty simultaneous PUTs of 30MB renders
         saturate the connection and every bar crawls together, which is slower
         overall and looks broken. One at a time finishes files, so the first
         thumbnails appear while the rest are still going. */
      const done: UploadedItem[] = [];
      for (const { row, file } of queued) {
        const result = await runOne(row.id, file);
        if (result) done.push(result);
      }

      if (done.length > 0) onUploaded?.(done);
    },
    [runOne, onUploaded],
  );

  const retry = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      patch(id, { stage: 'queued', progress: 0, label: 'Waiting', error: undefined });
      const result = await runOne(id, file);
      if (result) onUploaded?.([result]);
    },
    [patch, runOne, onUploaded],
  );

  const cancel = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
  }, []);

  const dismiss = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    files.current.delete(id);
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setRows((current) => current.filter((row) => row.stage !== 'done'));
  }, []);

  const busy = rows.some((row) => row.stage !== 'done' && row.stage !== 'failed');

  return { rows, add, retry, cancel, dismiss, clearFinished, busy };
}
