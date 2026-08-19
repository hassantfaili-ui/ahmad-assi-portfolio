'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MAIL_ICON =
  'M2 5.5A1.5 1.5 0 013.5 4h17A1.5 1.5 0 0122 5.5v13a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 18.5v-13zm2.2.5L12 12l7.8-6H4.2zM20 8.2l-7.4 5.7a1 1 0 01-1.2 0L4 8.2V18h16V8.2z';
const PHONE_ICON =
  'M6.6 2h3.1l1.6 4-2.1 1.5a12 12 0 005.3 5.3L16 10.7l4 1.6v3.1a2.6 2.6 0 01-2.9 2.6A15.6 15.6 0 014 6.9 2.6 2.6 0 016.6 2z';

/** A tel: URI takes digits and a leading plus, nothing else. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

interface FooterProps {
  name: string;
  discipline: string;
  location: string;
  email: string;
  phone: string;
  /** The home page pairs About with Get in touch, so the footer would repeat it. */
  hideCta?: boolean;
}

/**
 * Ends on an invitation rather than stopping.
 *
 * A client component for one reason: the Astro version took hideFooterCta as a
 * prop from each page, and an App Router layout cannot be handed props by the
 * page it wraps. Home is the only route that suppresses the call to action, so
 * it is recognised by its path here instead. The prop is still honoured, so any
 * caller that renders the footer itself can say so outright.
 */
export default function Footer({
  name,
  discipline,
  location,
  email,
  phone,
  hideCta,
}: FooterProps) {
  const pathname = usePathname();
  const hide = hideCta ?? pathname === '/';

  return (
    <footer className="foot">
      {!hide && (
        <div className="foot-cta">
          <p className="foot-kicker">Interested in collaborating?</p>
          <h2 className="foot-title">Get in touch</h2>
          <p className="foot-links">
            <a className="inline" href={`mailto:${email}`}>
              {email}
            </a>
            <a className="inline" href={telHref(phone)}>
              {phone}
            </a>
            <Link className="inline" href="/contact">
              Contact page
            </Link>
          </p>
        </div>
      )}

      <div className="foot-base">
        <Link className="wordmark" href="/">
          {name}
        </Link>
        <p className="foot-meta">{discipline} &nbsp;/&nbsp; {location}</p>
        <ul className="social">
          <li>
            <a href={`mailto:${email}`} aria-label={`Email ${name}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={MAIL_ICON}></path>
              </svg>
            </a>
          </li>
          <li>
            <a href={telHref(phone)} aria-label={`Telephone ${phone}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={PHONE_ICON}></path>
              </svg>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
