/**
 * Cropping a picture to a chosen shape without touching the file.
 *
 * Ahmad's renders arrive at whatever shape D5 or the camera gave them, and a
 * pair of them side by side only reads as a pair when they are the same shape.
 * The obvious fix, opening each one and cropping it, throws pixels away for
 * good and leaves a 7200 wide master as a 3000 wide one. So nothing here edits
 * a file. A group remembers the shape it wants, each picture remembers which
 * part of itself to keep, and the crop is cut from the full size master at the
 * moment it is served: Cloudflare trims the original and then resizes what is
 * left, so a visitor gets exactly the pixels the master had in that window.
 *
 * Pure on purpose. This is read by the editing screen, by the public page, by
 * the image loader and by the save, and every one of them has to compute the
 * same window from the same three facts: the master's size, the shape, and the
 * point to keep.
 */

/** The shapes on offer, widest first, as the control shows them. */
export const RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '9:16'] as const;

export type Ratio = (typeof RATIOS)[number];

/** Width over height for a shape, so 16:9 is about 1.78 and 9:16 about 0.56. */
export function ratioValue(ratio: Ratio): number {
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
}

/**
 * Whether a stored string is a shape this module knows.
 *
 * The database column is a plain string, so an older row, a hand edit, or a
 * payload from a stale screen can hold anything. Everything that reads one
 * goes through here and treats an unknown value as no shape at all.
 */
export function isRatio(value: unknown): value is Ratio {
  return typeof value === 'string' && (RATIOS as readonly string[]).includes(value);
}

export function toRatio(value: unknown): Ratio | null {
  return isRatio(value) ? value : null;
}

/**
 * Where in the picture to keep, as fractions across and down.
 *
 * 0.5 and 0.5 keeps the middle, which is what every picture starts with. 0
 * across keeps the left edge, 1 keeps the right. Only the axis with something
 * to lose is consulted: cropping a landscape to 16:9 takes off the top and
 * bottom, so x makes no difference there.
 */
export interface Focus {
  x: number;
  y: number;
}

export const CENTRE: Focus = { x: 0.5, y: 0.5 };

/** A focus kept to the picture. A stray value past an edge becomes the edge. */
export function clampFocus(focus: Partial<Focus> | null | undefined): Focus {
  const clamp = (n: unknown) => {
    const value = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
    return Math.min(1, Math.max(0, value));
  };
  return { x: clamp(focus?.x), y: clamp(focus?.y) };
}

export interface Size {
  width: number;
  height: number;
}

/** A master whose size was never read is shown at the size the page assumed. */
const ASSUMED: Size = { width: 1600, height: 1067 };

function sizeOf(master: { width: number | null; height: number | null }): Size {
  const width = master.width ?? 0;
  const height = master.height ?? 0;
  return width > 0 && height > 0 ? { width, height } : ASSUMED;
}

/**
 * The largest box of the shape that fits inside the master, in the master's
 * own pixels. This is the resolution the picture keeps: a 7200 by 4800 master
 * cut to 16:9 is 7200 by 4050, never smaller.
 */
export function cropFrame(
  master: { width: number | null; height: number | null },
  ratio: Ratio | null,
): Size {
  const size = sizeOf(master);
  if (!ratio) return size;

  const wanted = ratioValue(ratio);
  const own = size.width / size.height;

  /* Wider than wanted: keep the full height and cut the sides. Taller than
     wanted: keep the full width and cut top and bottom. Rounded down so the
     window never reaches past the edge by a pixel. */
  if (own > wanted) return { width: Math.floor(size.height * wanted), height: size.height };
  return { width: size.width, height: Math.floor(size.width / wanted) };
}

/**
 * The window, both ways round: where it starts and how big it is, and how much
 * of the master lies outside it on each edge. The second form is what the
 * image loader needs, and the master's size is not known there.
 */
export interface CropRect extends Size {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The window to cut, or null when the picture is shown whole.
 *
 * Null rather than a rectangle the size of the master, so that every caller
 * can tell "no crop" from "a crop" without comparing numbers, and so a picture
 * that already has the shape asked for is served as it always was.
 */
export function cropRect(
  master: { width: number | null; height: number | null },
  ratio: Ratio | null,
  focus: Focus,
): CropRect | null {
  if (!ratio) return null;

  const size = sizeOf(master);
  const frame = cropFrame(master, ratio);
  if (frame.width >= size.width && frame.height >= size.height) return null;

  const kept = clampFocus(focus);
  const left = Math.round((size.width - frame.width) * kept.x);
  const top = Math.round((size.height - frame.height) * kept.y);
  return {
    left,
    top,
    width: frame.width,
    height: frame.height,
    right: size.width - frame.width - left,
    bottom: size.height - frame.height - top,
  };
}

/**
 * The crop written into a next/image src.
 *
 * next/image hands its loader nothing but the src, a width and a quality, so
 * the window has to travel inside the src. It rides as a query string on the
 * object key, which the loader strips off before building the real URL. R2 keys
 * here are slugs and file names and never carry a question mark of their own.
 */
export function croppedSrc(key: string, rect: CropRect | null): string {
  if (!rect) return key;
  return `${key}?trim=${rect.top},${rect.right},${rect.bottom},${rect.left}`;
}

/** The four edges to take off, in the master's pixels: what the loader sends on. */
export interface Trim {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The key and the edges back out of a src, whether or not any were written in. */
export function parseCroppedSrc(src: string): { key: string; trim: Trim | null } {
  const mark = src.indexOf('?');
  if (mark === -1) return { key: src, trim: null };

  const key = src.slice(0, mark);
  const params = new URLSearchParams(src.slice(mark + 1));
  const written = params.get('trim');
  if (!written) return { key, trim: null };

  const parts = written.split(',').map(Number);
  const sound = parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0);
  if (!sound || parts.every((n) => n === 0)) return { key, trim: null };

  const [top, right, bottom, left] = parts;
  return { key, trim: { top, right, bottom, left } };
}

/**
 * The CSS that shows the same window when the file served is the whole master,
 * which is what the development server and a preview origin hand back. With a
 * box of the frame's shape and object-fit cover, object-position at the focus
 * lands on exactly the pixels cropRect would have cut.
 */
export function objectPosition(focus: Focus): string {
  const kept = clampFocus(focus);
  return `${round(kept.x * 100)}% ${round(kept.y * 100)}%`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
