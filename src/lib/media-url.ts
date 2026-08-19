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
 *
 * NEXT_PUBLIC_ and nothing else. This module is imported by client components,
 * so whatever it reads at module scope is compiled into the browser bundle. It
 * used to fall back to the server only MEDIA_ORIGIN, which is always empty in a
 * browser, so the client silently baked in the hard coded default instead. That
 * happened to match production and so broke nothing, while making the claim
 * that moving the bucket is one variable false: changing it would have left the
 * server rendering one origin and the browser hydrating with another.
 */
export const MEDIA_ORIGIN = (
  process.env.NEXT_PUBLIC_MEDIA_ORIGIN ??
  (process.env.NODE_ENV === 'development' ? '' : 'https://media.ahmadassi.ca')
).replace(/\/+$/, '');

/** True when media is coming off local disk rather than out of the bucket. */
const LOCAL_MEDIA = MEDIA_ORIGIN === '';

/**
 * Whether this origin can resize an image.
 *
 * Cloudflare Image Transformations live at /cdn-cgi/image on a zone, which
 * means a domain on the account. A bucket's own pub-....r2.dev address is not
 * one: it serves objects and nothing else, and a transformation URL against it
 * returns 404, verified rather than assumed.
 *
 * That matters because r2.dev is exactly what a preview deploy uses before the
 * custom domain is attached. Emitting a transformation URL there would break
 * every image on the page while looking like a code fault rather than a missing
 * piece of setup.
 */
const ORIGIN_CAN_TRANSFORM = !LOCAL_MEDIA && !/\.r2\.dev$/i.test(MEDIA_ORIGIN);

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

  /* The dev server serves the original off disk. */
  if (LOCAL_MEDIA) return `/api/media-dev/${key}`;

  /* An origin that cannot resize serves the original too. Full size rather than
     right size is a cost a visitor pays, but a broken image is worse, and this
     only happens on a preview origin. */
  if (!ORIGIN_CAN_TRANSFORM) return `${MEDIA_ORIGIN}/${key}`;

  const params = `width=${width},format=auto,quality=${quality ?? 82}`;
  return `${MEDIA_ORIGIN}/cdn-cgi/image/${params}/${key}`;
}
