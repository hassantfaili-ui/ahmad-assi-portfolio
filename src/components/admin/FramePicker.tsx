'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { completeUpload, requestPresigned, sendUpload, type MediaRow } from '@/lib/upload-client';
import { mediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

import type { EditorMedia } from '@/components/admin/MediaPanel';

/**
 * Choosing the still that shows before a walkthrough plays.
 *
 * The upload takes one automatically, two seconds in, and two seconds in is
 * often a fade, a blank sky or the camera still settling. This lets Ahmad scrub
 * through the film he already uploaded and take any frame of it instead.
 *
 * Everything happens in this browser. The film is read straight from the media
 * domain, which answers the admin's origin with CORS headers, so a frame drawn
 * onto a canvas can be read back out again. Without those headers the canvas
 * would be tainted and the export would throw.
 *
 * Scrubbing plays the smallest copy, because seeking a 4K file over the
 * network is slow enough to feel broken. The frame that is kept is then taken
 * from the largest copy at the same moment, so the still is as sharp as the
 * one the upload makes. Both copies come from one source and keep its
 * timestamps, so the moment is the same frame in each.
 */

/** As wide as the still the upload takes, see src/lib/transcode.ts. */
const STILL_WIDTH = 1920;

/** How many frames the strip under the player shows, evenly spread. */
const STRIP_COUNT = 8;

/** One frame at 30fps. Close enough for a step button at any frame rate. */
const FRAME_STEP = 1 / 30;

export interface FramePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: { height: number; media: EditorMedia }[];
  /** Called with the uploaded still. It is saved with the rest of the project. */
  onPicked: (media: MediaRow) => void;
}

/**
 * Move a video to a moment and wait until that frame is ready to draw.
 *
 * 'seeked' alone is not quite enough in Safari, which can fire it before the
 * new frame has been decoded, so where the browser can say when a frame is
 * actually presented, that is waited for too. Capped, because a paused video
 * is not obliged to present anything and a still that never arrives is worse
 * than one taken a few milliseconds early.
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('The film could not be read at that moment.'));
    };
    const onSeeked = () => {
      video.removeEventListener('error', onError);
      if (!('requestVideoFrameCallback' in video)) {
        resolve();
        return;
      }
      const timer = window.setTimeout(resolve, 300);
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

/** A detached video element for the film at a URL, resolved once its length is known. */
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('loadeddata', () => resolve(video), { once: true });
    video.addEventListener(
      'error',
      () => reject(new Error('The film could not be loaded. Check the connection and try again.')),
      { once: true },
    );
    video.src = url;
  });
}

function drawFrame(video: HTMLVideoElement, width: number): HTMLCanvasElement {
  const scale = Math.min(1, width / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not draw the frame.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read the frame.'))),
      'image/jpeg',
      0.85,
    );
  });
}

/** 83.4 seconds as 1:23.4, which is how a film's length is read. */
function formatTime(seconds: number): string {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  const rest = (whole - minutes * 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
}

export function FramePicker({ open, onOpenChange, sources, onPicked }: FramePickerProps) {
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">Choose the still from the film</DialogTitle>
        <DialogDescription className="text-sm text-neutral-600">
          Move through the film and stop on the frame you want visitors to see before they press
          play. It replaces the current still when you save the project.
        </DialogDescription>

        {/* Only mounted while the dialog is open, so every opening starts at
            the beginning of the film with no failure left over from last time. */}
        <Picker
          sources={sources}
          saving={saving}
          setSaving={setSaving}
          onPicked={onPicked}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PickerProps {
  sources: FramePickerProps['sources'];
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onPicked: (media: MediaRow) => void;
  onClose: () => void;
}

function Picker({ sources, saving, setSaving, onPicked, onClose }: PickerProps) {
  const ordered = [...sources].sort((a, b) => a.height - b.height);
  const smallest = ordered[0];
  const largest = ordered[ordered.length - 1];
  const previewUrl = smallest ? mediaUrl(smallest.media.key) : '';
  const fullUrl = largest ? mediaUrl(largest.media.key) : '';

  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [strip, setStrip] = useState<{ time: number; src: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* The strip is drawn from its own copy of the film, so building it never
     drags the player away from the frame Ahmad is looking at. */
  useEffect(() => {
    if (!previewUrl || duration <= 0) return;
    let cancelled = false;

    (async () => {
      try {
        const reader = await loadVideo(previewUrl);
        for (let index = 0; index < STRIP_COUNT; index += 1) {
          if (cancelled) break;
          /* Centred in each slice, so the strip never shows the very first
             frame (often black) or tries to seek past the last one. */
          const at = ((index + 0.5) / STRIP_COUNT) * duration;
          await seekTo(reader, at);
          const src = drawFrame(reader, 240).toDataURL('image/jpeg', 0.7);
          if (!cancelled) setStrip((current) => [...current, { time: at, src }]);
        }
        reader.removeAttribute('src');
        reader.load();
      } catch {
        /* The strip is a shortcut, not the picker. The slider still works. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl, duration]);

  const jump = useCallback(
    (to: number) => {
      const element = video.current;
      if (!element || duration <= 0) return;
      const clamped = Math.min(Math.max(0, to), Math.max(0, duration - FRAME_STEP));
      element.currentTime = clamped;
      setTime(clamped);
    },
    [duration],
  );

  const keep = useCallback(async () => {
    if (!largest) return;
    setSaving(true);
    setError(null);

    try {
      const reader = await loadVideo(fullUrl);
      await seekTo(reader, time);
      const blob = await canvasToJpeg(drawFrame(reader, STILL_WIDTH));
      const width = Math.min(STILL_WIDTH, reader.videoWidth);
      const height = Math.round(reader.videoHeight * (width / reader.videoWidth));
      reader.removeAttribute('src');
      reader.load();

      const name = `walkthrough-still-${Math.round(time * 1000)}ms.jpg`;
      const { uploads, rejected } = await requestPresigned(
        [{ name, size: blob.size, type: blob.type }],
        'film',
      );
      if (rejected.length > 0 || uploads.length === 0) {
        throw new Error(rejected[0]?.error ?? 'The server refused the still.');
      }

      const [upload] = uploads;
      const multipart = await sendUpload(upload, blob, () => {});
      const media = await completeUpload({ key: upload.key, name, width, height, multipart });

      onPicked(media);
      onClose();
    } catch (caught) {
      /* A canvas that refuses to export is the one failure here with a cause
         Ahmad cannot see, so it is named rather than passed through. */
      const message =
        caught instanceof DOMException && caught.name === 'SecurityError'
          ? 'The browser would not let this page read the film. The media domain is not allowing this address, so tell Hassan.'
          : caught instanceof Error
            ? caught.message
            : 'Something went wrong.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [fullUrl, largest, onClose, onPicked, setSaving, time]);

  return (
    <>
      <video
        ref={video}
        src={previewUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        className="aspect-video w-full rounded bg-neutral-900 object-contain"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onError={() => setError('The film could not be loaded. Check the connection and try again.')}
      />

      <div className="grid gap-2">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          disabled={duration <= 0}
          onChange={(event) => jump(Number(event.target.value))}
          aria-label="Moment in the film"
          className="w-full accent-neutral-900"
        />
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => jump(time - 1)} aria-label="Back one second">
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => jump(time - FRAME_STEP)} aria-label="Back one frame">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => jump(time + FRAME_STEP)} aria-label="Forward one frame">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => jump(time + 1)} aria-label="Forward one second">
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="ml-2 font-mono text-sm tabular-nums text-neutral-700">
            {formatTime(time)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {strip.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8" aria-label="Jump to a part of the film">
          {strip.map((frame) => {
            const near = Math.abs(frame.time - time) < duration / STRIP_COUNT / 2;
            return (
              <button
                key={frame.time}
                type="button"
                onClick={() => jump(frame.time)}
                aria-label={`Jump to ${formatTime(frame.time)}`}
                className={cn(
                  'overflow-hidden rounded border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
                  near ? 'border-neutral-900' : 'border-transparent hover:border-neutral-400',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn in this browser, nothing for next/image to optimise */}
                <img src={frame.src} alt="" className="aspect-video w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={saving || duration <= 0} onClick={keep}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? 'Taking the frame' : 'Use this frame'}
        </Button>
      </div>
    </>
  );
}
