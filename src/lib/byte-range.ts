/**
 * A single byte range from a Range header, inclusive at both ends.
 *
 * Only the one range form browsers send for media: bytes=start-, bytes=start-end
 * and bytes=-suffix. Anything else is served whole, which is always allowed.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === '' && match[2] === '')) return null;

  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}
