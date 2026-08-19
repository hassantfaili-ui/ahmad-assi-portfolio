import ProjectCard from '@/components/site/ProjectCard';
import ProjectPanels from '@/components/site/ProjectPanels';
import Rail from '@/components/site/Rail';
import type { ProjectSummary } from '@/lib/queries';
import { tiers } from '@/lib/tiers';

/**
 * The work, in three tiers.
 *
 * Leads are the large cards, the set is the strip, and the index is a short
 * list for the thin coursework: it stays on the site and stays clickable, but
 * it does not sit at the same size as the work that should be looked at first.
 *
 * The split is derived in src/lib/tiers.ts so this and the PDF cannot disagree,
 * and it is the tier and order on each project that decide it, not this file.
 *
 * This stays a server component. The rail's buttons and the expansions are the
 * only parts that need the browser, and each of those is its own client
 * component below.
 */

export interface ProjectGridProps {
  projects: ProjectSummary[];
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  const { leads, set, index } = tiers(projects);

  return (
    <>
      <div className="works" data-grid="">
        <ul className="leads">
          {leads.map((project) => (
            <ProjectCard key={project.id} project={project} lead />
          ))}
        </ul>

        <Rail count={set.length}>
          {set.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </Rail>

        {/*
          Coursework and case studies. Kept, named, credited and clickable, but
          not given the same room as the work a reviewer should look at first.
        */}
        {index.length > 0 && (
          <div className="index-block">
            <p className="rail-label index-head">
              Also in the archive <span className="rail-count">{index.length}</span>
            </p>
            <ul className="index-list">
              {index.map((project) => (
                <li key={project.id}>
                  <a href={`/work/${project.slug}`}>
                    <span className="index-year">{project.year}</span>
                    <span className="index-title">{project.title}</span>
                    <span className="index-kind">{project.buildingType}</span>
                    <span className="index-credit">{project.credit}</span>
                    <span className="index-go" aria-hidden="true">
                      {'\u2192'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/*
        The expansions sit outside the grid, as their own block under it. Only
        the cards get one, which is why the index is not in this list.
      */}
      <ProjectPanels projects={[...leads, ...set]} />
    </>
  );
}

export default ProjectGrid;
