'use client';

import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

import Footer from '@/components/site/Footer';
import Header from '@/components/site/Header';
import { words } from '@/lib/dictionary';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

/**
 * The header, the footer and the skip link, told which language they are in.
 *
 * They are rendered by src/app/(site)/layout.tsx, which wraps both languages
 * and is a server component, so it cannot be handed a locale and cannot read
 * the address either. These three read it from the path instead, which they can
 * do because they are already on the client: Header and Footer each call
 * usePathname for their own reasons, and this adds no round trip and no state.
 *
 * The path is known while a page is prerendered, so the right language is in
 * the HTML a visitor receives rather than swapped in after hydration.
 */

/**
 * Which language an address is in.
 *
 * The trailing slash is why this is not just a startsWith: the site is built
 * with trailingSlash on, so the French home page is /fr/ here and /fr in a
 * link. It belongs in src/lib/i18n.ts beside stripLocale, which answers the
 * other half of the same question.
 */
export function localeOf(pathname: string): Locale {
  return pathname === '/fr' || pathname.startsWith('/fr/') ? 'fr' : DEFAULT_LOCALE;
}

export function SkipLink() {
  return (
    <a className="skip" href="#main">
      {words(localeOf(usePathname())).skipToContent}
    </a>
  );
}

export function SiteHeader(props: Omit<ComponentProps<typeof Header>, 'locale'>) {
  return <Header {...props} locale={localeOf(usePathname())} />;
}

export function SiteFooter(props: Omit<ComponentProps<typeof Footer>, 'locale'>) {
  return <Footer {...props} locale={localeOf(usePathname())} />;
}
