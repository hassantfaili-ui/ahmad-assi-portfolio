import type { Metadata, Viewport } from 'next';

/* Both typefaces are self hosted, so no request leaves the visitor's browser.
   Imported here rather than from CSS because that is the documented pattern for
   Next, and because it keeps src/styles/site.css readable as plain CSS, which
   the portfolio PDF build depends on. */
import '@fontsource-variable/big-shoulders-display/wght';
import '@fontsource-variable/archivo/wdth';

import '@/app/globals.css';

import Footer from '@/components/site/Footer';
import Header from '@/components/site/Header';
import { getProfile } from '@/lib/queries';

/**
 * Set the theme before first paint so the page never flashes the wrong one.
 *
 * This has to be an inline script in the head. The choice lives in
 * localStorage, which the server cannot read, so anything that waits for React
 * (an effect, a state update) runs after the browser has already painted the
 * default, and a visitor who chose dark watches the page turn white and back
 * again on every navigation. Adding the `js` class here rather than in the
 * stylesheet is the same idea in reverse: the scroll reveals start hidden only
 * when there is script to reveal them.
 */
const THEME_SCRIPT = `(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  } catch (e) {}
})();`;

/* The domain is fixed, so metadataBase is a constant rather than an
   environment read. It is what turns the relative `alternates.canonical` each
   page declares into an absolute URL, which is the only form a canonical link
   is allowed to take. */
export const metadata: Metadata = {
  metadataBase: new URL('https://ahmadassi.ca'),
  title: 'Ahmad Assi, Architectural Designer',
  description: 'Portfolio of Ahmad Assi, architectural designer in Ottawa, Ontario.',
  openGraph: {
    title: 'Ahmad Assi, Architectural Designer',
    description: 'Portfolio of Ahmad Assi, architectural designer in Ottawa, Ontario.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#071417',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* The header and the footer both need the name, and the footer needs the
     rest of the contact details. Read once here, in the one server component
     that wraps every page, and hand them down: getProfile is server only, so a
     client component could not call it even if it wanted to. */
  const { profile } = await getProfile();

  return (
    /* The inline script above rewrites this element's class and data-theme
       before React hydrates, which is exactly the mismatch React would
       otherwise report. */
    <html lang="en-CA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>

      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>

        <Header name={profile?.name ?? ''} />

        <main id="main">{children}</main>

        <Footer
          name={profile?.name ?? ''}
          discipline={profile?.discipline ?? ''}
          location={profile?.location ?? ''}
          email={profile?.email ?? ''}
          phone={profile?.phone ?? ''}
        />
      </body>
    </html>
  );
}
