import type { Metadata } from 'next';

/* The two typefaces, self hosted, same as the site. */
import '@fontsource-variable/big-shoulders-display/wght';
import '@fontsource-variable/archivo/wdth';

/* print.css only, and that is the entire reason this layout exists.
   See the comment below. */
import '@/styles/print.css';

/**
 * A root layout of its own, so the portfolio PDF loads print.css and nothing
 * else.
 *
 * print.css says at the top that it is a separate stylesheet from the site on
 * purpose, because the site's rules are built for a scrolling viewport with
 * hover states and reveal animations, none of which mean anything on paper, and
 * inheriting them would mean fighting them. Rendering /print inside the site
 * layout broke exactly that promise and it was not theoretical: Tailwind's
 * preflight sets `ol, ul, menu { list-style: none }` and print.css never
 * re-enables markers, so every bullet under every role on the Experience sheet
 * vanished from the PDF; and site.css sets `body { font-weight: 300 }`, which
 * every unweighted element on every sheet then inherited instead of the 400 the
 * Astro PDF rendered at. Hiding the header and footer with display:none undoes
 * neither.
 *
 * Next allows this through route groups, each with its own root layout, which
 * is why the public pages live under (site) and this lives under (print).
 */

export const metadata: Metadata = {
  title: 'Ahmad Assi, portfolio',
  /* noindex alone, as the Astro page had it. The sheets link to the live site
     and those links are worth following. */
  robots: 'noindex',
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  /* lang="en" rather than en-CA, matching print.astro. The PDF is read as a
     document rather than served as a page, and this is the value the existing
     portfolio was built with. */
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
