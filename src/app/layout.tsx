import type { Metadata } from 'next';

/* Both typefaces are self hosted, so no request leaves the visitor's browser.
   Imported here rather than from CSS because that is the documented pattern for
   Next, and because it keeps src/styles/site.css readable as plain CSS, which
   the portfolio PDF build depends on. */
import '@fontsource-variable/big-shoulders-display/wght';
import '@fontsource-variable/archivo/wdth';

import './globals.css';

export const metadata: Metadata = {
  title: 'Ahmad Assi, Architectural Designer',
  description: 'Portfolio of Ahmad Assi, architectural designer in Ottawa, Ontario.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
