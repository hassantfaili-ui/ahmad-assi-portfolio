/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';

import { words } from '@/lib/dictionary';

/**
 * The switch that takes a visitor from one language to the other.
 *
 * What is tested here is the address it points at and the name it announces,
 * because both are easy to get subtly wrong and neither is visible when you
 * look at the header. A switch that always returns to the home page, or one
 * that says "View in English" while sitting on the English site, would look
 * exactly right in a screenshot.
 */

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

/* A plain anchor, because next/link wants a mounted app router. The href is
   what this test is about, and Link renders it unchanged. */
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import LanguageToggle from './LanguageToggle';

/* Scoped to what this call rendered, not to the whole document: two of the
   tests below mount the switch twice to compare the two directions. */
function toggle(pathname: string, locale: 'en' | 'fr') {
  nav.pathname = pathname;
  const { container } = render(<LanguageToggle locale={locale} />);
  return within(container).getByRole('link');
}

describe('the language switch', () => {
  it('sends an English page to the same page in French', () => {
    expect(toggle('/architecture', 'en')).toHaveAttribute('href', '/fr/architecture');
  });

  it('sends a French page back to the English address it already had', () => {
    /* The English addresses are printed on a resume and indexed, so this is the
       half that must not acquire a prefix of its own. */
    expect(toggle('/fr/work/lincoln-beach-center', 'fr')).toHaveAttribute(
      'href',
      '/work/lincoln-beach-center',
    );
  });

  it('crosses between the two home pages in both directions', () => {
    expect(toggle('/', 'en')).toHaveAttribute('href', '/fr');
    expect(toggle('/fr', 'fr')).toHaveAttribute('href', '/');
  });

  it('is a link, so it can be opened in a new tab and works without script', () => {
    const link = toggle('/resume', 'en');

    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href');
  });

  it('names the language at the other end, in that language', () => {
    const link = toggle('/', 'en');

    expect(link).toHaveAccessibleName(words('en').switchLanguage);
    expect(link).toHaveAttribute('hreflang', 'fr-CA');
    expect(link).toHaveAttribute('lang', 'fr-CA');
    expect(link).toHaveTextContent(words('fr').languageName);
  });

  it('does the same in reverse from the French side', () => {
    const link = toggle('/fr', 'fr');

    expect(link).toHaveAccessibleName(words('fr').switchLanguage);
    expect(link).toHaveAttribute('hreflang', 'en-CA');
    expect(link).toHaveTextContent(words('en').languageName);
  });

  it('keeps the word on it inside the name it announces', () => {
    /* WCAG's label in name rule, and the reason anyone using voice control can
       say what they can see. The label is in the other language on purpose, so
       this is the property that keeps that from being a regression. */
    for (const locale of ['en', 'fr'] as const) {
      const link = toggle('/', locale);
      const visible = link.textContent ?? '';
      expect(words(locale).switchLanguage.toLowerCase()).toContain(visible.toLowerCase());
    }
  });
});
