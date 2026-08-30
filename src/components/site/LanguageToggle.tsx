'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { words } from '@/lib/dictionary';
import { HTML_LANG, localePath, otherLocale, stripLocale, type Locale } from '@/lib/i18n';

/**
 * The language switch, beside the theme switch.
 *
 * A link and not a button, which is the whole of the design. The other
 * language of this page is a real address, so it has to be something a visitor
 * can open in a new tab, copy, bookmark, hand to a crawler, or follow with
 * JavaScript turned off. A button calling router.push would be none of those.
 *
 * The word on it names the language the press would give you, the way the
 * theme switch reads Dark while the page is still light.
 *
 * The accessible name is deliberately in the language being switched to: a
 * French reader looking at the English page is scanning for French. That is
 * safe for the WCAG label in name rule only because the visible word sits
 * inside the phrase, Français inside Voir en français, so anyone using voice
 * control can still say what they can see. If either string in the dictionary
 * changes, keep that true.
 */
export default function LanguageToggle({ locale = 'en' }: { locale?: Locale }) {
  const pathname = usePathname();
  const other = otherLocale(locale);

  /* The same page, in the other language. Stripped before it is rebuilt so it
     reads the same from either side: /fr/architecture and /architecture both
     reduce to the one path both addresses are made from. */
  const href = localePath(other, stripLocale(pathname));

  return (
    <Link
      className="lang"
      href={href}
      /* Both attributes, both naming the language at the other end. hreflang is
         for the browser and the crawler; lang is for the reader, because the
         anchor's own text and its label are in that language and a screen
         reader would otherwise sound Français out in English. */
      hrefLang={HTML_LANG[other]}
      lang={HTML_LANG[other]}
      aria-label={words(locale).switchLanguage}
    >
      {words(other).languageName}
    </Link>
  );
}
