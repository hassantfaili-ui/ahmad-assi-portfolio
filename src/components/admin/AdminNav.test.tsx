/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

/* The bar renders inside the admin layout, which supplies both of these. A bare
   render has neither, and neither is what is being tested: the order of the
   links is. */
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/home',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/admin/UnsavedWork', () => ({
  useUnsavedWork: () => ({ isAnyUnsaved: () => false, confirmLeave: () => Promise.resolve(true) }),
}));

/* A plain anchor, because next/link wants a mounted app router. GuardedLink
   itself stays real: it is what the bar actually renders, and swapping it out
   would leave this test asserting about a stand in. prefetch is written to a
   data attribute rather than spread onto the anchor, because React warns about
   an unknown attribute on a DOM element and a warning nobody reads is how a
   real one goes unnoticed. */
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={prefetch === false ? 'off' : undefined} {...rest}>
      {children}
    </a>
  ),
}));

import { AdminNav } from './AdminNav';

function navLinks() {
  const bar = screen.getByRole('navigation', { name: 'Editing' });
  return within(bar).getAllByRole('link');
}

describe('the editing navigation bar', () => {
  /* The order is the point of the bar, not a detail of it: it is meant to read
     as the order of the site, home first. A link appended to the end of the
     array by whoever adds the next screen would break that quietly. */
  it('reads in the order of the site', () => {
    render(<AdminNav email="ahmad@example.com" />);

    expect(navLinks().map((link) => link.textContent)).toEqual([
      'Home',
      'Projects',
      'Resume',
      'Contact',
      'Media',
    ]);
  });

  it('sends each label to its own screen', () => {
    render(<AdminNav email="ahmad@example.com" />);

    expect(navLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/admin/home',
      '/admin',
      '/admin/resume',
      '/admin/contact',
      '/admin/media',
    ]);
  });

  /* Settings held one thing, the film behind the name, and that is on Home now.
     Leaving the link up would offer a second door to a screen that no longer
     exists. */
  it('no longer offers Settings', () => {
    render(<AdminNav email="ahmad@example.com" />);

    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });
});
