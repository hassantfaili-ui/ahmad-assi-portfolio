import type { Metadata } from 'next';

import '@fontsource-variable/archivo/wdth';
import '@/app/globals.css';

/**
 * A root layout for the editing area, separate from the site's.
 *
 * The administration interface is Tailwind and Radix, and the public site is a
 * hand written black and white system. Sharing a root layout would mean each
 * inheriting the other's assumptions about type, weight and colour, which is
 * how a form ends up with a display typeface and a portfolio page ends up with
 * a form's reset.
 *
 * The guard is not here. It is in (admin)/admin/layout.tsx, one level down,
 * because that is the layout every /admin page renders inside.
 */

export const metadata: Metadata = {
  title: 'Editing, Ahmad Assi',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
