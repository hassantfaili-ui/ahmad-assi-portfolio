/**
 * Base-aware URL builder.
 *
 * GitHub Pages serves a project repo from a subfolder, so the site lives at
 * /ahmad-assi-portfolio rather than at the root. Astro does not rewrite absolute
 * paths in markup or content for you, so every internal link and every asset
 * path has to go through here.
 *
 * Content files keep clean paths like /media/hero-1440.mp4, which is what the editor
 * shows and what a person would expect to type. The prefix is applied at render
 * time instead.
 *
 * Moving to a custom domain later means setting base back to '/' in
 * astro.config.mjs. Nothing else has to change.
 */

const BASE = import.meta.env.BASE_URL || '/';

/** Strip any trailing slash so joins never double up. */
const ROOT = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;

/** Anything already absolute, or not an internal path, is left alone. */
function external(path: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.startsWith('#')
  );
}

export function url(path: string | undefined | null): string {
  if (!path) return '';
  if (external(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${ROOT}${p}` || '/';
}

/**
 * True when the given internal path is the page currently being rendered.
 * Compares against the real pathname, which includes the base, and ignores a
 * trailing slash so /resume and /resume/ both match.
 */
export function isCurrent(pathname: string, path: string): boolean {
  const norm = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
  return norm(pathname) === norm(url(path));
}

/**
 * URL for a film.
 *
 * The two films are the only files on this site big enough to run into a host's
 * per-file limit, and Cloudflare's is 25 MiB: the 42.8MB hero failed the build
 * outright. Rather than let that dictate the encode quality forever, films go
 * through here so they can be served from object storage instead, where there is
 * no such cap and, on R2, no egress charge either.
 *
 * Set PUBLIC_MEDIA_ORIGIN to the bucket's custom domain, for example
 * https://media.example.com, and the films are fetched from there. The build
 * then also drops them out of dist, in src/integrations/shrink-media.mjs, so the
 * published bundle cannot trip the limit with files nothing references.
 *
 * Leave it unset and everything behaves as before, served from this site. That
 * is the default on purpose: the site has to build for somebody who has not set
 * up a bucket.
 */
const MEDIA_ORIGIN = (import.meta.env.PUBLIC_MEDIA_ORIGIN || '').replace(/\/+$/, '');

export function filmUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (external(path)) return path;
  if (!MEDIA_ORIGIN) return url(path);
  return `${MEDIA_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
