import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Image from 'next/image';

import Reveal from '@/components/site/Reveal';
import { contactDescription, pageWords } from '@/components/site/pages/copy';
import { alternatesFor, openGraphFor } from '@/components/site/pages/metadata';
import { words } from '@/lib/dictionary';
import type { Locale } from '@/lib/i18n';
import { mediaUrl } from '@/lib/media-url';
import { getProfile } from '@/lib/queries';

/**
 * Email only.
 *
 * There is no form. Cloudflare has nothing that accepts a submission without a
 * third party service, and markup that silently posts nowhere is worse than
 * none. Email was always the primary route anyway: a practice writing to a
 * graduate attaches a brief or a job description, and no form field takes an
 * attachment.
 *
 * /contact and /fr/contact both render this.
 */

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/(site)/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

/** A tel: URI takes digits and a leading plus, nothing else. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export async function contactMetadata(locale: Locale): Promise<Metadata> {
  const { profile } = await getProfile(locale);

  const name = profile?.name ?? FALLBACK_NAME;
  const title = `${words(locale).contact}, ${name}`;
  const description = contactDescription(locale, name, profile?.location ?? '');

  return {
    title,
    description,
    alternates: alternatesFor(locale, '/contact'),
    openGraph: openGraphFor(locale, title, description),
  };
}

export default async function ContactPage({ locale }: { locale: Locale }) {
  const w = words(locale);
  const page = pageWords(locale);

  const { profile, social } = await getProfile(locale);

  const email = profile?.email ?? '';
  const phone = profile?.phone ?? '';

  /* Falling back rather than rendering nothing. An empty row, or a database
     that has not been migrated yet, would otherwise leave the contact page with
     a blank where its heading goes.

     The fallbacks are in the reader's language, while the fields themselves
     fall back to English the way everything else does: a French visitor sees
     Ahmad's English words until he writes the French ones, which is the point,
     but an empty database should not also be an English one. */
  const status = profile?.contactStatus?.trim() || w.availableNow;
  const heading = profile?.contactHeading?.trim() || w.writeToMe;
  const blurb = profile?.contactBlurb?.trim() || page.contactBlurb;
  const mailto = `mailto:${email}?subject=${encodeURIComponent(page.enquirySubject)}`;

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${profile?.location ?? ''} \u00a0/\u00a0 `}
          <em>{status}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          {w.contact}
        </h1>
        <p className="sub" style={{ '--i': 2 } as CSSProperties}>
          {profile?.availability ?? ''}
        </p>
      </section>

      <section className="band">
        <div className="contact-grid">
          <Reveal>
            <h2 className="closing-heading">{heading}</h2>
            <p className="closing-prose" style={{ marginTop: '1rem' }}>
              {blurb}
            </p>
            {email && (
              <p style={{ marginTop: '2rem' }}>
                <a className="btn" href={mailto}>
                  {`${email} `}
                  <span className="i" aria-hidden="true">
                    &rarr;
                  </span>
                </a>
              </p>
            )}
          </Reveal>

          <Reveal>
            {profile?.portraitMedia && (
              <Image
                className="contact-portrait"
                src={profile.portraitMedia.key}
                alt={profile.portraitAlt || profile.name}
                width={profile.portraitMedia.width ?? 800}
                height={profile.portraitMedia.height ?? 1000}
                sizes="(max-width: 760px) 90vw, (max-width: 1100px) 42vw, 448px"
                loading="eager"
              />
            )}
            <dl className="contact-facts">
              {email && (
                <div>
                  <dt>{w.email}</dt>
                  <dd>
                    <a className="inline" href={`mailto:${email}`}>
                      {email}
                    </a>
                  </dd>
                </div>
              )}
              {phone && (
                <div>
                  <dt>{w.phone}</dt>
                  <dd>
                    <a className="inline" href={telHref(phone)}>
                      {phone}
                    </a>
                  </dd>
                </div>
              )}
              {profile?.location && (
                <div>
                  <dt>{w.basedIn}</dt>
                  <dd>{profile.location}</dd>
                </div>
              )}
              {social.length > 0 && (
                <div>
                  <dt>{w.elsewhere}</dt>
                  <dd>
                    {social.map((link) => (
                      <a
                        className="inline"
                        href={link.href}
                        key={link.id}
                        style={{ display: 'block' }}
                      >
                        {link.label}
                      </a>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            {(profile?.cvMedia || profile?.portfolioMedia) && (
              /* The files are served from the media domain, so a browser ignores
                 the download attribute and opens the PDF instead of saving it.
                 It stays because that is the intent, and because a same origin
                 media host would honour it. */
              <p className="contact-files">
                {profile?.portfolioMedia && (
                  <a className="btn" href={mediaUrl(profile.portfolioMedia.key)} download>
                    {w.portfolioPdf}{' '}
                    <span className="i" aria-hidden="true">
                      &darr;
                    </span>
                  </a>
                )}
                {profile?.cvMedia && (
                  <a className="btn" href={mediaUrl(profile.cvMedia.key)} download>
                    {w.resumePdf}{' '}
                    <span className="i" aria-hidden="true">
                      &darr;
                    </span>
                  </a>
                )}
              </p>
            )}
          </Reveal>
        </div>
      </section>
    </>
  );
}
