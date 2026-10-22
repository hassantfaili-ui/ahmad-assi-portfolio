'use client';

import Image from 'next/image';
import { useCallback, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

import { CENTRE, clampFocus, cropFrame, objectPosition, type Focus, type Ratio } from '@/lib/crop';
import type { EditorMedia } from '@/components/admin/MediaPanel';

/**
 * The picture as it will be cut, and the control for which part stays.
 *
 * Shown with CSS rather than by asking the bucket for a cropped copy: the
 * thumbnail is the whole master in a box of the chosen shape, fitted to cover
 * it, positioned at the focus. That is exactly the window the page cuts out of
 * the full size file, so what Ahmad sees here is what a visitor gets.
 *
 * Clicking on the picture moves the focus there: click the left side to keep
 * the left side. Arrow keys nudge it, Home puts it back in the middle. The
 * control only does anything once a shape is chosen, because a picture shown
 * whole has nothing to choose.
 */

export interface CropPreviewProps {
  media: EditorMedia;
  ratio: Ratio | null;
  focus: Focus;
  onFocusChange: (focus: Focus) => void;
  /** What the picture is, for the control's name. */
  describedAs: string;
}

const STEP = 0.05;

export function CropPreview({ media, ratio, focus, onFocusChange, describedAs }: CropPreviewProps) {
  const frame = cropFrame(media, ratio);
  const wide = frame.width >= frame.height;

  /* A landscape box is 10rem wide; a portrait one is 10rem tall, so a 9:16
     picture does not run the row down the page. */
  const box: CSSProperties = {
    aspectRatio: `${frame.width} / ${frame.height}`,
    ...(wide ? { width: '10rem' } : { height: '10rem' }),
  };

  const image: CSSProperties = {
    objectFit: 'cover',
    objectPosition: objectPosition(focus),
    width: '100%',
    height: '100%',
  };

  const choose = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      onFocusChange(
        clampFocus({
          x: (event.clientX - bounds.left) / bounds.width,
          y: (event.clientY - bounds.top) / bounds.height,
        }),
      );
    },
    [onFocusChange],
  );

  const nudge = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const moves: Record<string, Focus> = {
        ArrowLeft: { x: focus.x - STEP, y: focus.y },
        ArrowRight: { x: focus.x + STEP, y: focus.y },
        ArrowUp: { x: focus.x, y: focus.y - STEP },
        ArrowDown: { x: focus.x, y: focus.y + STEP },
        Home: CENTRE,
      };
      const next = moves[event.key];
      if (!next) return;
      event.preventDefault();
      onFocusChange(clampFocus(next));
    },
    [focus, onFocusChange],
  );

  const picture = (
    <Image
      src={media.key}
      alt=""
      width={frame.width}
      height={frame.height}
      sizes="160px"
      style={image}
      className="rounded bg-neutral-200"
      draggable={false}
    />
  );

  if (!ratio) {
    return (
      <div style={box} className="shrink-0 overflow-hidden rounded">
        {picture}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={choose}
      onKeyDown={nudge}
      style={box}
      className="relative shrink-0 cursor-crosshair overflow-hidden rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      aria-label={`Which part of ${describedAs} stays. Click the part to keep, or move it with the arrow keys; Home puts it back in the middle.`}
      title="Click the part of the picture to keep"
    >
      {picture}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-900/70 shadow"
        style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
      />
    </button>
  );
}
