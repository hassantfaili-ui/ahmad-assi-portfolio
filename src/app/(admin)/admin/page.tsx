import type { Metadata } from 'next';

import { ProjectsTable } from '@/components/admin/ProjectsTable';
import { countLeads, listProjects } from '@/lib/admin-queries';
import { leadOverflowWarning } from '@/lib/validation';

/**
 * The first screen Ahmad sees.
 *
 * A server component that does the reading and hands it to one client component
 * that does the editing. Nothing here is cached: this list has to show what the
 * database holds this second, including the projects a visitor cannot see,
 * because a stale row here is a row he would edit believing it is current.
 *
 * The lead count is asked for separately rather than counted from the rows.
 * leadOverflowWarning is the same function the save actions call, so the
 * warning on load and the warning after a change are one rule in one place.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Projects, Ahmad Assi',
};

export default async function AdminProjectsPage() {
  const [projects, leadCount] = await Promise.all([listProjects(), countLeads()]);

  return <ProjectsTable projects={projects} initialNotice={leadOverflowWarning(leadCount)} />;
}
