/**
 * The two languages the site is written in.
 *
 * English is the site itself: its pages live at the addresses they always have,
 * and every English word is the record in the database or a literal in the
 * page. French is an overlay. Where a French translation exists it is used, and
 * where it does not the English shows through.
 *
 * That fallback is the whole design. Ahmad has seventeen projects and a resume
 * to translate, and a site that only worked once the last box was filled in
 * would be a site that never launched in French at all. This way the French
 * pages are real from the first sentence he writes, and improve as he writes
 * more.
 */

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The address of a page in a given language.
 *
 * English keeps the addresses the site already has, because they are printed on
 * a resume and indexed by search engines, and moving them to /en would break
 * every one of them for nothing. French sits under /fr.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? '/fr' : `/fr${clean}`;
}

/** The same page in the other language, for the switch in the header. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'fr' : 'en';
}

/** What a French address is once /fr is taken off, for building the English one. */
export function stripLocale(pathname: string): string {
  if (pathname === '/fr') return '/';
  return pathname.startsWith('/fr/') ? pathname.slice(3) : pathname;
}

/** The language tag for the html element and for hreflang. */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en-CA',
  fr: 'fr-CA',
};
