import type { Metadata } from 'next';

import { HTML_LANG, localePath, otherLocale, type Locale } from '@/lib/i18n';

/**
 * What every page has to say about its other language.
 *
 * A canonical on its own tells a search engine which address is the real one.
 * It does not say that the English page and the French page are the same page,
 * and without that the two compete rather than pair, which for a portfolio
 * whose whole job is to be found is the difference between one site in two
 * languages and two thin sites.
 *
 * The path handed in is always the English one, because the English address is
 * the address: localePath turns it into the French one and leaves English
 * alone.
 */
export function alternatesFor(locale: Locale, path: string): Metadata['alternates'] {
  return {
    canonical: localePath(locale, path),
    languages: {
      [HTML_LANG.en]: localePath('en', path),
      [HTML_LANG.fr]: localePath('fr', path),
      /* What to show a reader whose language the site has no version of.
         English, because English is the site's own language. */
      'x-default': localePath('en', path),
    },
  };
}

/**
 * Open Graph writes a language as en_CA, not en-CA.
 *
 * One underscore apart from HTML_LANG, which is why it is written out rather
 * than derived: a replace() here would read as though the two formats were the
 * same idea, and the next tag that needs a third spelling would be hidden
 * inside it. It belongs beside HTML_LANG in src/lib/i18n.ts once that file is
 * open for edits again.
 */
const OG_LOCALE: Record<Locale, string> = {
  en: 'en_CA',
  fr: 'fr_CA',
};

/** The card a link to this page unfurls into, in the language of the page. */
export function openGraphFor(locale: Locale, title: string, description: string) {
  return {
    title,
    description,
    type: 'website' as const,
    locale: OG_LOCALE[locale],
    alternateLocale: OG_LOCALE[otherLocale(locale)],
  };
}
