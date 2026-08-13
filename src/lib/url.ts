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
