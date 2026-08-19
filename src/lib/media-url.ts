/**
 * Object keys to URLs.
 *
 * Every row in the database stores an R2 object key, never a URL. That is
 * deliberate and it is the same discipline PUBLIC_MEDIA_ORIGIN enforced in the
 * Astro site: moving the bucket, or putting a different custom domain in front
 * of it, is then one variable rather than a migration over every row.
 */

/**
 * Where published media is served from.
 *
 * Empty in development unless it is set explicitly, and that is deliberate:
 * with no origin the URLs become relative and resolve against the dev server,
 * where /api/media-dev serves the same files off disk. Somebody cloning this
 * repository can then run it and see the real site without an R2 account, real
 * credentials, or a 98MB download.
 */
export const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ||
  process.env.MEDIA_ORIGIN ||
  (process.env.NODE_ENV === 'development' ? '' : 'https://media.ahmadassi.ca')
).replace(/\/+$/, '');

/** True when media is coming off local disk rather than out of the bucket. */
const LOCAL_MEDIA = MEDIA_ORIGIN === '';

/** The public URL of an object, given its key. */
export function mediaUrl(key: string): string {
  if (!key) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(key) || key.startsWith('//')) return key;
  const clean = key.replace(/^\/+/, '');
  if (LOCAL_MEDIA) return `/api/media-dev/${clean}`;
  return `${MEDIA_ORIGIN}/${clean}`;
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
  const key = src.replace(/^\/+/, '');

  /* No transformations off local disk: /cdn-cgi/image only exists on a
     Cloudflare zone. The dev server serves the original, which is the right
     trade for development and is why the loader has to know the difference. */
  if (LOCAL_MEDIA) return `/api/media-dev/${key}`;

  const params = `width=${width},format=auto,quality=${quality ?? 82}`;
  return `${MEDIA_ORIGIN}/cdn-cgi/image/${params}/${key}`;
}
