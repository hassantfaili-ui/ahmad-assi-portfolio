'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { LEAD_SIZES, RAIL_SIZES } from './ProjectCard';
import type { ProjectSummary } from '@/lib/queries';
import { STATUS_LABELS } from '@/lib/validation';

/**
 * The expansions.
 *
 * Every panel is rendered on the server and closed, with the `hidden`
 * attribute, so a reader with no JavaScript still gets the content and the
 * browser can reuse the card image it has already fetched. Clicking a tile then
 * opens its project under the rail instead of navigating, which is an
 * enhancement on top of that and never a replacement for it: the tile stays a
 * real link to /work/<slug>, and a modified click, the kind that opens a new
 * tab or downloads, is left alone.
 *
 * Only cards expand. The index list links straight through to the project page,
 * so building panels for those would be markup nothing can reach.
 *
 * The tiles are server rendered by ProjectCard and sit outside this component's
 * tree, so their state is mirrored onto them through the DOM. Everything below
 * `.panels` is React's.
 */

export interface ProjectPanelsProps {
  /** The leads and the strip, in the order they appear in the grid. */
  projects: ProjectSummary[];
}

/**
 * The panel media column is a little over half of a 78rem block, and the whole
 * width below 880px. Told to the loader so a phone is never sent the master.
 */
/**
 * The panel reuses the card's own sizes string rather than declaring a third
 * one.
 *
 * Both point at the same R2 object. A different sizes value resolves to a
 * different Cloudflare derivative width, so opening a panel started a second
 * download of a picture the visitor was already looking at. Matching the card
 * means the browser serves it from cache.
 */

/** Only rows that have a value. An empty row is worse than no row. */
function facts(project: ProjectSummary): [string, string][] {
  const status = STATUS_LABELS[project.status as keyof typeof STATUS_LABELS] ?? project.status;
  const rows: [string, string][] = [
    ['Type', project.buildingType],
    ['Location', project.location],
    ['Year', String(project.year)],
    // The enum cannot hold a space, so it is never shown raw.
    ['Status', status],
    ['Role', project.role],
  ];
  return rows.filter(([, value]) => value);
}

/** Every tile in the grid, leads and strip alike. */
function triggers(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-expand]'));
}

/** The slug named by /#panel-<slug>, or an empty string. */
function readHashSlug(): string {
  return window.location.hash.startsWith('#panel-')
    ? window.location.hash.slice('#panel-'.length)
    : '';
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function ProjectPanels({ projects }: ProjectPanelsProps) {
  /**
   * Which panel is open, from two sources.
   *
   * The URL hash is one: /architecture#panel-lincoln-beach-center has to open
   * that project on arrival, and it should keep working when someone presses
   * back. Read through useSyncExternalStore rather than copied into state in an
   * effect, because the hash is genuinely external and mirroring it means
   * writing state during hydration, which React rejects and which also silently
   * stopped responding to a later hash change.
   *
   * A click is the other. Once Ahmad's visitor has opened or closed something
   * themselves, their choice outranks the hash, so `chosen` starts undefined
   * and takes over the moment it is set.
   */
  const hashSlug = useSyncExternalStore(subscribeToHash, readHashSlug, () => '');
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);

  const hashIsReal = Boolean(hashSlug) && projects.some((project) => project.slug === hashSlug);
  const openSlug = chosen !== undefined ? chosen : hashIsReal ? hashSlug : null;

  const setOpenSlug = useCallback(
    (next: string | null | ((current: string | null) => string | null)) => {
      setChosen((current) => {
        const resolved = current !== undefined ? current : null;
        return typeof next === 'function' ? next(resolved) : next;
      });
    },
    [],
  );
  const panelsRef = useRef<HTMLDivElement>(null);

  /**
   * Set by a click, cleared by the effect that acts on it. A panel opened by
   * the deep link must not steal focus, because the reader has not asked for
   * anything yet.
   */
  const focusOnOpen = useRef(false);

  const panelFor = useCallback((slug: string) => {
    const panels = Array.from(panelsRef.current?.children ?? []) as HTMLElement[];
    return panels.find((panel) => panel.dataset.panel === slug);
  }, []);

  /* The tiles belong to the server rendered grid, so they are updated here. */
  useEffect(() => {
    for (const trigger of triggers()) {
      const isOpen = trigger.dataset.expand === openSlug;
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      trigger.closest('.card')?.classList.toggle('is-open', isOpen);
    }
    // The open project stays lit while the rest recede, which site.css does off
    // this class on the grid.
    document.querySelector('[data-grid]')?.classList.toggle('has-open', openSlug !== null);
  }, [openSlug]);

  /* Move the reader into the panel, but only when a click asked for it. */
  useEffect(() => {
    const wanted = focusOnOpen.current;
    focusOnOpen.current = false;
    if (!openSlug || !wanted) return;

    const panel = panelFor(openSlug);
    if (!panel) return;

    // The heading carries tabIndex -1 so a keyboard reader lands inside the
    // panel rather than back at the top of the grid.
    panel.querySelector<HTMLElement>('.panel-title')?.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [openSlug, panelFor]);

  /* The tiles are links first. This intercepts only the plain click. */
  useEffect(() => {
    const tiles = triggers();

    const onClick = (event: MouseEvent) => {
      // Let people open the real page in a new tab or window.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      const slug = (event.currentTarget as HTMLElement).dataset.expand;
      // No panel for this tile means nothing to expand into, so the click is
      // left to the link rather than being swallowed by a dead handler.
      if (!slug || !panelFor(slug)) return;
      event.preventDefault();
      focusOnOpen.current = true;
      // Clicking the open one closes it.
      setOpenSlug((current) => (current === slug ? null : slug));
    };

    tiles.forEach((tile) => tile.addEventListener('click', onClick));
    return () => tiles.forEach((tile) => tile.removeEventListener('click', onClick));
  }, [panelFor, setOpenSlug]);

  /* Escape closes, and hands focus back to the tile that opened it. */
  useEffect(() => {
    if (!openSlug) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const trigger = triggers().find((tile) => tile.dataset.expand === openSlug);
      setOpenSlug(null);
      trigger?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSlug, setOpenSlug]);

  const close = useCallback(
    (slug: string) => {
      setOpenSlug(null);
      triggers()
        .find((tile) => tile.dataset.expand === slug)
        ?.focus();
    },
    [setOpenSlug],
  );

  return (
    <div className="panels" data-panels="" ref={panelsRef}>
      {projects.map((project) => (
        <section
          key={project.id}
          className="panel"
          id={`panel-${project.slug}`}
          data-panel={project.slug}
          aria-labelledby={`panel-title-${project.slug}`}
          hidden={project.slug !== openSlug}
        >
          <div className="panel-inner">
            <div className="panel-media">
              {project.leadImage ? (
                <Image
                  src={project.leadImage.key}
                  alt={project.leadImageAlt}
                  width={project.leadImage.width ?? 1600}
                  height={project.leadImage.height ?? 1067}
                  sizes={project.tier === 'lead' ? LEAD_SIZES : RAIL_SIZES}
                />
              ) : null}
            </div>

            <div className="panel-text">
              <p className="eyebrow">
                {project.category}
                {/* Written as escapes: a literal non-breaking space in source is invisible. */}
                {' \u00a0/\u00a0 '}
                <em>{project.year}</em>
              </p>
              <h3 className="panel-title" id={`panel-title-${project.slug}`} tabIndex={-1}>
                {project.title}
              </h3>
              <p className="panel-summary">{project.summary}</p>

              <dl className="panel-facts">
                {facts(project).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="panel-actions">
                <a className="btn" href={`/work/${project.slug}`}>
                  Full sheet <span className="i" aria-hidden="true">{'\u2192'}</span>
                </a>
                <button
                  className="panel-close"
                  type="button"
                  data-panel-close=""
                  onClick={() => close(project.slug)}
                >
                  Close
                </button>
              </p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export default ProjectPanels;
