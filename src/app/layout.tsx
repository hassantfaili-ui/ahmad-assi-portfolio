import type { Metadata } from 'next';
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
