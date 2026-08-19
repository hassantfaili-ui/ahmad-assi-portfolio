import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

import Reveal from '@/components/site/Reveal';
import { CONTACT_DEFAULTS } from '@/lib/contact-defaults';
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
 */

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

const SUBJECT = encodeURIComponent('Enquiry from your portfolio');

/** A tel: URI takes digits and a leading plus, nothing else. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getProfile();

  const name = profile?.name ?? FALLBACK_NAME;
  const title = `Contact, ${name}`;
  const description = `Get in touch with ${name} in ${profile?.location ?? ''}.`;

  return {
    title,
    description,
    alternates: { canonical: '/contact' },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function ContactPage() {
  const { profile, social } = await getProfile();

  const email = profile?.email ?? '';
  const phone = profile?.phone ?? '';

  /* Falling back rather than rendering nothing. An empty row, or a database
     that has not been migrated yet, would otherwise leave the contact page with
     a blank where its heading goes. */
  const status = profile?.contactStatus?.trim() || CONTACT_DEFAULTS.status;
  const heading = profile?.contactHeading?.trim() || CONTACT_DEFAULTS.heading;
  const blurb = profile?.contactBlurb?.trim() || CONTACT_DEFAULTS.blurb;
  const mailto = `mailto:${email}?subject=${SUBJECT}`;

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${profile?.location ?? ''} \u00a0/\u00a0 `}
          <em>{status}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          Contact
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
            <dl className="contact-facts">
              {email && (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a className="inline" href={`mailto:${email}`}>
                      {email}
                    </a>
                  </dd>
                </div>
              )}
              {phone && (
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a className="inline" href={telHref(phone)}>
                      {phone}
                    </a>
                  </dd>
                </div>
              )}
              {profile?.location && (
                <div>
                  <dt>Based in</dt>
                  <dd>{profile.location}</dd>
                </div>
              )}
              {social.length > 0 && (
                <div>
                  <dt>Elsewhere</dt>
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
                    Portfolio PDF{' '}
                    <span className="i" aria-hidden="true">
                      &darr;
                    </span>
                  </a>
                )}
                {profile?.cvMedia && (
                  <a className="btn" href={mediaUrl(profile.cvMedia.key)} download>
                    Resume PDF{' '}
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
