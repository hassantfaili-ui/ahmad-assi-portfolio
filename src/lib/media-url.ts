/**
 * Object keys to URLs.
 *
 * Every row in the database stores an R2 object key, never a URL. That is
 * deliberate and it is the same discipline PUBLIC_MEDIA_ORIGIN enforced in the
 * Astro site: moving the bucket, or putting a different custom domain in front
 * of it, is then one variable rather than a migration over every row.
 */

/** Trailing slashes stripped so joins never double up. */
export const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ||
  process.env.MEDIA_ORIGIN ||
  'https://media.ahmadassi.ca'
).replace(/\/+$/, '');

/** The public URL of an object, given its key. */
export function mediaUrl(key: string): string {
  if (!key) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(key) || key.startsWith('//')) return key;
  return `${MEDIA_ORIGIN}/${key.replace(/^\/+/, '')}`;
}

export interface ImageLoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

/**
 * The next/image loader.
 *
 * Next's own optimiser does not run on Cloudflare Workers, so this points at
 * Cloudflare Image Transformations on the media zone instead. One upload
 * becomes every size the layout asks for, in AVIF or WebP where the browser
 * takes them, which is what lets Ahmad drop a 39MB export straight out of D5
 * without a phone paying for it.
 *
 * Quality 82 is the point where a re-encoded architectural render stops being
 * distinguishable from the master at matched display size.
 */
export function imageLoader({ src, width, quality }: ImageLoaderArgs): string {
  const params = `width=${width},format=auto,quality=${quality ?? 82}`;
  const key = src.replace(/^\/+/, '');
  return `${MEDIA_ORIGIN}/cdn-cgi/image/${params}/${key}`;
}
