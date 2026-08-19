import Image from 'next/image';

import type { ProjectSummary } from '@/lib/queries';

/**
 * One project card, built on the Foster + Partners pattern: the image sits
 * flush at the top of a panel, and the panel carries the title, a round arrow
 * and a single line of year and place. Nothing overlays the image, which is
 * what keeps a wall of these readable.
 *
 * The same card serves the three lead projects and the twelve in the rail. Only
 * scale changes between them, which is the whole hierarchy.
 */

export interface ProjectCardProps {
  project: ProjectSummary;
  /** True for the three large cards at the top of the grid. */
  lead?: boolean;
}

/**
 * The card wants the place, not the postal address. A first part beginning with
 * a street number is dropped, so "13904 Hayne Boulevard, New Orleans, Louisiana"
 * reads as "New Orleans, Louisiana" here and stays complete on the project page.
 */
function place(location: string): string {
  return location.replace(/^\s*\d+[^,]*,\s*/, '');
}

/**
 * What the layout actually gives each card, so the loader is asked for that
 * width rather than for the width of the master file. Without this next/image
 * has nothing to go on but the intrinsic size and offers the browser the full
 * export, which is the one thing the Cloudflare loader exists to prevent.
 *
 * The numbers track site.css: leads run three across, two below 900px and one
 * below 560px, and the rail column is 16rem to 21rem, widening to 72vw below
 * 700px. First lead spans both columns at two up, so leads claim the full width
 * from 900px down rather than half.
 */
export const LEAD_SIZES = '(max-width: 900px) 100vw, 33vw';
export const RAIL_SIZES = '(max-width: 700px) 72vw, 21rem';

export function ProjectCard({ project, lead = false }: ProjectCardProps) {
  const image = project.leadImage;

  return (
    <li className={lead ? 'card card-lead' : 'card'} data-tile={project.slug}>
      {/*
        An ordinary anchor, not a router link. The tile is a real link to the
        project page, and ProjectPanels calls preventDefault on a plain click to
        expand the project in place instead. A router link would want to handle
        the same click, and the expansion is the behaviour that has to win.
      */}
      <a
        href={`/work/${project.slug}`}
        data-expand={project.slug}
        aria-expanded="false"
        aria-controls={`panel-${project.slug}`}
      >
        <span className="card-media">
          {image ? (
            <Image
              src={image.key}
              alt={project.leadImageAlt}
              width={image.width ?? 1600}
              height={image.height ?? 1067}
              sizes={lead ? LEAD_SIZES : RAIL_SIZES}
              /* Leads are above the fold on every screen, the rail is not. */
              priority={lead}
            />
          ) : null}
        </span>

        <span className="card-body">
          <span className="card-head">
            <b className="card-title">{project.title}</b>
            <span className="card-go" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
              </svg>
            </span>
          </span>
          <span className="card-meta">
            {project.year}
            {/* Written as escapes: a literal non-breaking space in source is invisible. */}
            {' \u00a0\u00b7\u00a0 '}
            {place(project.location)}
          </span>
          <span className="card-credit">{project.credit}</span>
        </span>
      </a>
    </li>
  );
}

export default ProjectCard;
