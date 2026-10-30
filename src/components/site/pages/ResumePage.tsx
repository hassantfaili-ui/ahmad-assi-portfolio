import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

import Reveal from '@/components/site/Reveal';
import SkillIcon from '@/components/site/SkillIcon';
import { pageWords, resumeDescription } from '@/components/site/pages/copy';
import { alternatesFor, openGraphFor } from '@/components/site/pages/metadata';
import { words } from '@/lib/dictionary';
import type { Locale } from '@/lib/i18n';
import { mediaUrl } from '@/lib/media-url';
import { getProfile } from '@/lib/queries';

/**
 * The resume, in whichever language it was asked for.
 *
 * Everything on this page is Ahmad's writing except the six headings, so it is
 * the page the overlay does the most work on. getProfile takes the language and
 * reads all nine models with it, which is why this component simply asks for
 * the resume and renders it.
 */

/* The database is empty until the migration runs, so the title still needs a
   name. The same default src/app/(site)/layout.tsx carries. */
const FALLBACK_NAME = 'Ahmad Assi';

/**
 * The gap between one skill group and the next.
 *
 * The Astro page set it on the wrapper div. That wrapper is the Reveal
 * component here and it takes no style prop, so the margin sits on the last
 * element inside the group instead. It collapses out of the wrapper, so the
 * spacing is identical and the markup keeps the elements and classes it had.
 */
const GROUP_GAP = '2.75rem';

/**
 * Which skill group is drawn as icons rather than listed.
 *
 * The group is recognised by its heading, which was always thin and became a
 * defect the moment the heading could be translated: an exact test against
 * "software" would have found nothing on a French resume headed "Logiciels"
 * and quietly dropped every icon on the page. Both words are accepted, and
 * loosely, so a heading of "Logiciels et outils" still gets its drawings.
 *
 * The real answer is for a skill group to carry what kind of group it is
 * instead of being identified by what it is called. That is a column and a
 * migration, which is a bigger change than a translation should carry.
 */
function isSoftware(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes('software') || lower.includes('logiciel');
}

export async function resumeMetadata(locale: Locale): Promise<Metadata> {
  const { profile } = await getProfile(locale);

  const name = profile?.name ?? FALLBACK_NAME;
  const title = `${words(locale).resume}, ${name}`;
  const description = resumeDescription(
    locale,
    name,
    profile?.discipline ?? '',
    profile?.location ?? '',
  );

  return {
    title,
    description,
    alternates: alternatesFor(locale, '/resume'),
    openGraph: openGraphFor(locale, title, description),
  };
}

export default async function ResumePage({ locale }: { locale: Locale }) {
  const w = words(locale);
  const page = pageWords(locale);

  const { profile, facts, education, experience, skillGroups, languages, entries } =
    await getProfile(locale);

  /* Four resume lists share one table, so this page takes the one it shows. */
  const volunteering = entries.filter((entry) => entry.section === 'volunteering');

  return (
    <>
      <section className="hero load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {/* Written as escapes: a literal non-breaking space in source is invisible. */}
          {`${profile?.credential ?? ''} \u00a0/\u00a0 `}
          <em>{profile?.yearsExperience ?? ''}</em>
        </p>
        <h1 className="page-title" style={{ '--i': 1 } as CSSProperties}>
          {w.resume}
        </h1>
        <p className="sub" style={{ '--i': 2 } as CSSProperties}>
          {`${profile?.location ?? ''} \u00a0/\u00a0 ${profile?.phone ?? ''} \u00a0/\u00a0 `}
          {profile?.email && (
            <a className="inline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
          )}
        </p>

      </section>

      {/* A reader scans before they read. Categories with a few lines each, and
          the full document one click away, rather than three paragraphs of
          prose. The four categories were hand written markup in the Astro site
          and are Fact rows now, so Ahmad can edit them without a deploy. */}
      <section className="band">
        <div className="atglance">
          {facts.map((fact) => (
            <Reveal className="atglance-item" key={fact.id}>
              <p className="group-label">{fact.label}</p>
              <ul>
                {fact.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>

        {(profile?.cvMedia || profile?.portfolioMedia) && (
          <p className="resume-files">
            {/* Files on the media domain open as PDFs; a same-origin media
                host also honours the download attribute. */}
            {profile?.cvMedia && (
              <a className="btn" href={mediaUrl(profile.cvMedia.key)} download>
                {page.fullResumePdf}{' '}
                <span className="i" aria-hidden="true">
                  &darr;
                </span>
              </a>
            )}
            {profile?.portfolioMedia && (
              <a className="btn" href={mediaUrl(profile.portfolioMedia.key)} download>
                {locale === 'fr' ? 'Portfolio, PDF' : 'Portfolio PDF'}{' '}
                <span className="i" aria-hidden="true">
                  &darr;
                </span>
              </a>
            )}
          </p>
        )}
      </section>

      <section className="band">
        <h2 className="section-title">{page.education}</h2>
        <ul className="list">
          {education.map((entry) => (
            <Reveal as="li" key={entry.id}>
              <p className="when">{entry.year || page.completed}</p>
              <div>
                <h3 className="r">{entry.credential}</h3>
                <p className="f">{entry.institution}</p>
                {entry.note && (
                  <p style={{ margin: '0.6rem 0 0', color: 'var(--ink-2)' }}>{entry.note}</p>
                )}
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="band">
        <h2 className="section-title">{page.experience}</h2>
        <ul className="list">
          {experience.map((role) => (
            <Reveal as="li" key={role.id}>
              <p className="when">{role.period}</p>
              <div>
                <h3 className="r">{role.role}</h3>
                <p className="f">{`${role.firm} \u00a0/\u00a0 ${role.location}`}</p>
                <ul>
                  {role.contributions.map((contribution) => (
                    <li key={contribution}>{contribution}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      {volunteering.length > 0 && (
        <section className="band">
          <h2 className="section-title">{page.community}</h2>
          <ul className="list">
            {volunteering.map((entry) => (
              <Reveal as="li" key={entry.id}>
                <p className="when">{entry.year || page.ongoing}</p>
                <div>
                  <h3 className="r">{entry.title}</h3>
                  <p className="f">{entry.detail}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      <section className="band">
        <h2 className="section-title">{page.skills}</h2>
        {skillGroups.map((group) => (
          <Reveal key={group.id}>
            <p className="group-label">{group.label}</p>
            {/* Software is a set of tools, so it is drawn rather than listed.
                The rest are things he does, which only words describe. */}
            {isSoftware(group.label) ? (
              <ul className="software" style={{ marginBottom: GROUP_GAP }}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <SkillIcon name={item.name} />
                    <span>{item.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="tags" style={{ marginBottom: GROUP_GAP }}>
                {group.items.map((item) => (
                  <span className="tag" key={item.id}>
                    {item.name}
                  </span>
                ))}
              </div>
            )}
          </Reveal>
        ))}
        <Reveal>
          <p className="group-label">{page.languages}</p>
          <div className="tags">
            {languages.map((language) => (
              <span className="tag" key={language.id}>
                {language.text}
              </span>
            ))}
          </div>
        </Reveal>
        <p className="group-label" style={{ marginTop: '3rem' }}>
          {`${w.references} ${(profile?.references ?? '').toLowerCase()}`}
        </p>
      </section>
    </>
  );
}
