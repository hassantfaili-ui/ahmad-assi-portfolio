import type { Metadata } from 'next';
import Image from 'next/image';
import { Fragment } from 'react';

import { renderMarkdown } from '@/lib/markdown';
import { getProfile, getProjectBySlug, getPublishedProjects } from '@/lib/queries';
import type { MediaRef, ProjectDetail } from '@/lib/queries';
import { tiers } from '@/lib/tiers';
import { STATUS_LABELS } from '@/lib/validation';


/**
 * The portfolio PDF, as a web page.
 *
 * This exists so the document Ahmad attaches to an application and the link he
 * sends alongside it cannot drift apart. Both read the same rows, in the same
 * order, with the same crediting. Change a project and both change.
 *
 * Rendered to PDF by serving the site and driving headless Chrome. The Astro
 * version pointed its images at /print/, a set of downscaled copies a script
 * generated and then deleted, because embedding the full resolution originals
 * makes a 25MB file and application portals reject those. That step is gone:
 * next/image asks Cloudflare Image Transformations for a print sized copy of
 * each object, so the two pass build and its temporary folder are no longer
 * needed. The sizes below are chosen for a 297mm sheet, not for a viewport.
 *
 * Not linked from the site navigation. It is a source file for a document, not
 * a page anyone should land on.
 */

/* The database is empty until the migration runs, and a document with no
   projects in it still has to render. The same default src/app/layout.tsx
   carries. */
const FALLBACK_NAME = 'Ahmad Assi';

/**
 * The site chrome, switched off.
 *
 * The header, the footer and the skip link have no place on a sheet, and
 * headless Chrome would print them across the cover. The Astro page was its own
 * HTML document and never had them. In the App Router the root layout owns
 * them, and a page cannot opt out of the layout that wraps it, so they are
 * hidden from here instead. The proper fix is a route group giving /print its
 * own root layout, which is a change to files this page does not own.
 */
const HIDE_SITE_CHROME = '.skip,.top,.foot{display:none!important}';

/* A full sheet is 297mm, which is about 1120 pixels at print resolution. The
   small figures are roughly 80mm across. Both are told to the loader so it asks
   the media zone for a copy that size rather than for the master. */
const SHEET_SIZES = '1200px';
const FIGURE_SIZES = '640px';

/**
 * The cover.
 *
 * The Astro page named one file outright, the night aerial of the Lincoln Beach
 * Center. Nothing in the database says "cover", so it is found by name among
 * the lead projects and the first lead's own lead image stands in when it is
 * not there. That keeps the printed cover the one Ahmad chose without a
 * hardcoded object key that would 404 in silence the first time a file is
 * replaced.
 */
const COVER_HINT = 'lb-aerial-night';

/* Sheet numbering runs across the whole document so a reviewer can refer to a
   page out loud. The cover is 01, the contents 02, and the work starts at 03.

   Every number is worked out from the shape the document is built in rather
   than typed in or counted off as the page renders: two pages for each of the
   leads, then one for each of the set. Getting them from the structure means
   the contents and the sheets themselves cannot drift apart when a project
   moves between tiers. */
const FIRST_WORK_PAGE = 3;
const leadPage = (i: number) => FIRST_WORK_PAGE + i * 2;
const pad = (n: number) => String(n).padStart(2, '0');

/** The enum cannot hold a space, so it is never shown raw. */
function status(project: ProjectDetail): string {
  return STATUS_LABELS[project.status as keyof typeof STATUS_LABELS] ?? project.status;
}

/** The place, not the postal address. */
function place(location: string): string {
  return location.replace(/^\s*\d+[^,]*,\s*/, '');
}

/** Every gallery image, flattened, so a page can just take the first few. */
function gallery(project: ProjectDetail): MediaRef[] {
  return project.imageGroups.flatMap((group) => group.images.map((image) => image.media));
}

function drawings(project: ProjectDetail): MediaRef[] {
  return project.drawings.map((drawing) => drawing.media);
}

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getProfile();

  return {
    title: `${profile?.name ?? FALLBACK_NAME}, portfolio`,
    /* A source file for a document, not a page anyone should land on. */
    robots: { index: false, follow: false },
  };
}

export default async function PrintPage() {
  const [all, { profile, experience, education, skillGroups, languages }] = await Promise.all([
    getPublishedProjects(),
    getProfile(),
  ]);

  /* Same derivation as the home page, so a fourth project marked as a lead
     lands in the same place in both rather than making a spread here and
     vanishing there. */
  const { leads, set, index } = tiers(all);

  /* The summaries carry enough for the index, but a spread needs the brief, the
     groups and the drawings, so the leads and the set are read in full. A
     project that has been unpublished between the two reads simply drops out
     rather than taking the document down with it. */
  const [leadDetails, setDetails] = await Promise.all([
    Promise.all(leads.map((project) => getProjectBySlug(project.slug))),
    Promise.all(set.map((project) => getProjectBySlug(project.slug))),
  ]).then(([one, two]) => [
    one.filter((project): project is ProjectDetail => project !== null),
    two.filter((project): project is ProjectDetail => project !== null),
  ]);

  const setPage = (i: number) => FIRST_WORK_PAGE + leadDetails.length * 2 + i;
  const archivePage = FIRST_WORK_PAGE + leadDetails.length * 2 + setDetails.length;

  const coverImage =
    leadDetails
      .flatMap((project) => gallery(project))
      .find((media) => media.key.includes(COVER_HINT)) ??
    leadDetails[0]?.leadImage ??
    null;

  const name = profile?.name ?? FALLBACK_NAME;
  const [firstName, ...restOfName] = name.split(' ');

  /* The printed address. One domain, the same one metadataBase names in
     src/app/layout.tsx, written without its scheme because it is being read
     off paper rather than clicked. */
  const liveUrl = 'ahmadassi.ca';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_SITE_CHROME }} />

      {/* 01, cover */}
      <div className="sheet">
        <div className="cover-img">
          {coverImage && (
            <Image
              src={coverImage.key}
              alt=""
              width={coverImage.width ?? 1600}
              height={coverImage.height ?? 1067}
              sizes={SHEET_SIZES}
              /* A PDF is printed in one pass, so nothing may be deferred: a
                 lazy image on sheet nine is an empty box in the document. */
              loading="eager"
            />
          )}
        </div>
        <div className="cover-plate">
          <p className="p-label">
            {`Selected work \u00a0·\u00a0 ${profile?.issued ?? ''}`}
          </p>
          <h1 className="cover-name">
            {firstName}
            <br />
            {restOfName.join(' ')}
          </h1>
          <p className="p-label" style={{ marginBottom: '5mm' }}>
            {`${profile?.discipline ?? ''} \u00a0·\u00a0 ${profile?.location ?? ''}`}
          </p>
          <div className="cover-meta">
            <span>{profile?.email ?? ''}</span>
            <span>{profile?.phone ?? ''}</span>
          </div>
        </div>
      </div>

      {/* 02, contents: the site's three tiers, in the site's order */}
      <div className="sheet">
        <div className="plain">
          <p className="p-label">
            {`Selected work \u00a0·\u00a0 ${profile?.issued ?? ''}`}
          </p>
          <h2 className="p-title">Contents</h2>

          <div className="toc">
            <div>
              <section className="toc-group toc-lead">
                <div className="toc-head">
                  <p className="p-label">Selected projects</p>
                  <p className="p-label">{leadDetails.length}</p>
                </div>
                <ul className="toc-list">
                  {leadDetails.map((project, i) => (
                    <li key={project.id}>
                      <span className="t">{project.title}</span>
                      <span className="n">{pad(leadPage(i))}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="toc-group toc-set">
                <div className="toc-head">
                  <p className="p-label">The set</p>
                  <p className="p-label">{setDetails.length}</p>
                </div>
                <ul className="toc-list">
                  {setDetails.map((project, i) => (
                    <li key={project.id}>
                      <span className="t">{project.title}</span>
                      <span className="n">{pad(setPage(i))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div>
              <section className="toc-group toc-archive">
                <div className="toc-head">
                  <p className="p-label">
                    {`Also in the archive \u00a0·\u00a0 page ${pad(archivePage)}`}
                  </p>
                  <p className="p-label">{index.length}</p>
                </div>
                <ul className="toc-list">
                  {index.map((project) => (
                    <li key={project.id}>
                      <span className="t">{project.title}</span>
                      <span className="n">{project.year}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="toc-group toc-archive">
                <div className="toc-head">
                  <p className="p-label">And</p>
                  <p className="p-label">3</p>
                </div>
                <ul className="toc-list">
                  <li>
                    <span className="t">Resume, experience</span>
                    <span className="n">{pad(archivePage + 1)}</span>
                  </li>
                  <li>
                    <span className="t">Education and skills</span>
                    <span className="n">{pad(archivePage + 2)}</span>
                  </li>
                  <li>
                    <span className="t">Contact</span>
                    <span className="n">{pad(archivePage + 3)}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <p className="p-body" style={{ marginTop: 'auto', maxWidth: '150mm' }}>
            {`The same work, in the same order, as ${liveUrl}.`}
          </p>
        </div>
        <p className="sheet-no">{'Contents \u00a0/\u00a0 02'}</p>
      </div>

      {/* the three lead projects, two pages each */}
      {leadDetails.map((project, i) => {
        const images = gallery(project);
        const sheets = drawings(project);
        /* Prefer drawings on the detail page: a plan or a section is what tells
           a reviewer the project was resolved, and renders already had the
           hero. */
        const picks = [...sheets.slice(0, 2), ...images].slice(0, 4);

        return (
          <Fragment key={project.id}>
            <div className="sheet">
              <div className="hero-img">
                {project.leadImage && (
                  <Image
                    src={project.leadImage.key}
                    alt=""
                    width={project.leadImage.width ?? 1600}
                    height={project.leadImage.height ?? 1067}
                    sizes={SHEET_SIZES}
                    loading="eager"
                  />
                )}
              </div>
              <div className="hero-plate">
                <p className="p-label">
                  {`${project.category} \u00a0·\u00a0 ${project.year}`}
                </p>
                <h2 className="p-title">{project.title}</h2>
                <div className="hero-facts">
                  <span>{place(project.location)}</span>
                  <span>{status(project)}</span>
                  {project.area && <span>{project.area}</span>}
                  <span>
                    <b>{project.credit}</b>
                  </span>
                </div>
              </div>
              <p className="sheet-no">
                {`${project.sheet} \u00a0/\u00a0 ${pad(leadPage(i))}`}
              </p>
            </div>

            <div className="sheet">
              <div className="detail">
                <div className="detail-text">
                  <p className="p-label">{project.buildingType}</p>
                  <h3 className="p-title">{project.title}</h3>
                  {/* The same renderer the project pages use. This page split
                      on blank lines instead, which printed the markdown source
                      into the portfolio: Renewal Square read "**Garden
                      Heights**" with the asterisks, and the cabinets cut sheet
                      table vanished entirely. This is the document Ahmad
                      attaches to applications, so it is the worst place of the
                      two to get it wrong. */}
                  <div
                    className="detail-body p-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(project.body) }}
                  />
                  <p className="detail-credit">{project.credit}</p>
                </div>
                <div className={picks.length === 3 ? 'detail-grid is-three' : 'detail-grid'}>
                  {picks.map((media, n) => (
                    /* An image can legitimately appear in two groups, so the
                       position is part of the key. */
                    <figure key={`${n}-${media.id}`}>
                      <Image
                        src={media.key}
                        alt=""
                        width={media.width ?? 1600}
                        height={media.height ?? 1067}
                        sizes={FIGURE_SIZES}
                        loading="eager"
                      />
                    </figure>
                  ))}
                </div>
              </div>
              <p className="sheet-no">
                {`${project.sheet} \u00a0/\u00a0 ${pad(leadPage(i) + 1)}`}
              </p>
            </div>
          </Fragment>
        );
      })}

      {/* the set, one page each */}
      {setDetails.map((project, i) => {
        const images = gallery(project);
        const sheets = drawings(project);
        const side = [...images.slice(0, 1), ...sheets.slice(0, 1)].slice(0, 2);
        while (side.length < 2 && images.length > side.length) side.push(images[side.length]);

        return (
          <div className="sheet" key={project.id}>
            <div className="single">
              <div className="single-main">
                {project.leadImage && (
                  <Image
                    src={project.leadImage.key}
                    alt=""
                    width={project.leadImage.width ?? 1600}
                    height={project.leadImage.height ?? 1067}
                    sizes={SHEET_SIZES}
                    loading="eager"
                  />
                )}
              </div>
              <div className="single-foot">
                <div className="single-text">
                  <p className="p-label">
                    {`${project.category} \u00a0·\u00a0 ${project.year}`}
                  </p>
                  <h2 className="p-title">{project.title}</h2>
                  <p className="p-body">{project.summary}</p>
                  <p className="p-body" style={{ marginTop: '3mm' }}>
                    <b style={{ fontWeight: 400, color: 'var(--ink)' }}>My part.</b>{' '}
                    {project.contribution}
                  </p>
                  <div className="hero-facts" style={{ marginTop: '5mm' }}>
                    <span>{place(project.location)}</span>
                    <span>{status(project)}</span>
                    <span>
                      <b>{project.credit}</b>
                    </span>
                  </div>
                </div>
                <div className="single-strip">
                  {side.map((media, n) => (
                    <figure key={`${n}-${media.id}`}>
                      <Image
                        src={media.key}
                        alt=""
                        width={media.width ?? 1600}
                        height={media.height ?? 1067}
                        sizes={FIGURE_SIZES}
                        loading="eager"
                      />
                    </figure>
                  ))}
                </div>
              </div>
            </div>
            <p className="sheet-no">
              {`${project.sheet} \u00a0/\u00a0 ${pad(setPage(i))}`}
            </p>
          </div>
        );
      })}

      {/* the index */}
      <div className="sheet">
        <div className="plain">
          <p className="p-label">Also in the archive</p>
          <h2 className="p-title">Coursework and case studies</h2>
          <ul className="idx">
            {index.map((project) => (
              <li key={project.id}>
                <span className="y">{project.year}</span>
                <span className="t">{project.title}</span>
                <span className="k">{project.buildingType}</span>
                <span className="c">{project.credit}</span>
              </li>
            ))}
          </ul>
          <p className="p-body" style={{ marginTop: 'auto', maxWidth: '170mm' }}>
            Group work and studies of existing buildings, listed rather than shown. The full set is
            on the site, and I am happy to send drawings from any of them on request.
          </p>
        </div>
        <p className="sheet-no">
          {`Index \u00a0/\u00a0 ${pad(archivePage)}`}
        </p>
      </div>

      {/* resume, experience */}
      <div className="sheet">
        <div className="plain">
          <p className="p-label">
            {`${profile?.discipline ?? ''} \u00a0·\u00a0 ${profile?.location ?? ''}`}
          </p>
          <h2 className="p-title">Experience</h2>
          <div className="cv">
            {experience.map((entry) => (
              <section key={entry.id}>
                <div className="cv-item">
                  <b>{entry.role}</b>
                  <p className="w">
                    {`${entry.firm} \u00a0·\u00a0 ${entry.period}`}
                  </p>
                  <ul>
                    {entry.contributions.slice(0, 3).map((contribution) => (
                      <li key={contribution}>{contribution}</li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}
          </div>
        </div>
        <p className="sheet-no">
          {`Resume \u00a0/\u00a0 ${pad(archivePage + 1)}`}
        </p>
      </div>

      {/* resume, education and skills */}
      <div className="sheet">
        <div className="plain">
          <p className="p-label">{name}</p>
          <h2 className="p-title">Education and skills</h2>
          <div className="cv">
            <section>
              <h3>Education</h3>
              {education.map((entry) => (
                <div className="cv-item" key={entry.id}>
                  <b>{entry.credential}</b>
                  <p className="w">
                    {`${entry.institution} \u00a0·\u00a0 ${entry.year}`}
                  </p>
                  {entry.note && <p className="p-body">{entry.note}</p>}
                </div>
              ))}
              <h3 style={{ marginTop: '7mm' }}>Languages</h3>
              <div className="cv-tags">
                {languages.map((language) => (
                  <span key={language.id}>{language.text}</span>
                ))}
              </div>
            </section>
            <section>
              {skillGroups.map((group) => (
                <Fragment key={group.id}>
                  <h3 style={{ marginTop: 0 }}>{group.label}</h3>
                  <div className="cv-tags" style={{ marginBottom: '6mm' }}>
                    {group.items.map((item) => (
                      <span key={item.id}>{item.name}</span>
                    ))}
                  </div>
                </Fragment>
              ))}
            </section>
          </div>
        </div>
        <p className="sheet-no">
          {`Resume \u00a0/\u00a0 ${pad(archivePage + 2)}`}
        </p>
      </div>

      {/* closing */}
      <div className="sheet">
        <div className="end">
          <div>
            <p className="p-label">{profile?.availability ?? ''}</p>
            <h2 className="p-title" style={{ marginTop: '6mm' }}>
              Happy to talk through any of this in person.
            </h2>
          </div>
          <div className="end-rows">
            <div>
              <span>Email</span>
              {profile?.email ?? ''}
            </div>
            <div>
              <span>Phone</span>
              {profile?.phone ?? ''}
            </div>
            <div>
              <span>Based in</span>
              {profile?.location ?? ''}
            </div>
            <div>
              <span>Portfolio</span>
              {liveUrl}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
