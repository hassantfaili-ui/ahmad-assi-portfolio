import { SignedOut } from '@/components/admin/SignedOut';
import { getIdentity } from '@/lib/access';
import { notFound } from 'next/navigation';

import {
  FILM_FRENCH_FIELDS,
  PROJECT_FRENCH_FIELDS,
  toEditorDrawings,
  toEditorFrench,
  toEditorGroups,
} from '@/lib/editor-shape';

import { ProjectForm } from '@/components/admin/ProjectForm';
import type { EditorMedia } from '@/components/admin/MediaPanel';
import { getProjectForEditing } from '@/lib/admin-queries';
import { translationsFor } from '@/lib/translations';

/**
 * One project, edited.
 *
 * The screen Ahmad spends his time in, so it loads everything it needs in one
 * query and hands it to a client component whole. No spinner, no second round
 * trip: the arrangement he is about to drag is already on the page when it
 * paints.
 *
 * There is no authentication check here, deliberately. It is in the layout this
 * page renders inside, which is a guard that cannot be forgotten when a route
 * is added.
 */

interface ProjectEditorPageProps {
  params: Promise<{ id: string }>;
}

/** Only the parts of a Media row this screen shows. */
function toMedia(media: {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
}): EditorMedia {
  return {
    id: media.id,
    key: media.key,
    bytes: media.bytes,
    width: media.width,
    height: media.height,
  };
}

export default async function ProjectEditorPage({ params }: ProjectEditorPageProps) {
  /* Guarded here as well as in the layout. An RSC request for this
     segment can render the page without re-rendering the layout, which
     skipped the layout's check entirely and served the editing data to
     anonymous requests. */
  if (!(await getIdentity())) return <SignedOut />;

  const { id } = await params;
  const project = await getProjectForEditing(id);

  /* A project deleted in another tab, or a link that was pasted wrong. Either
     way there is nothing to edit, and the 404 says so. */
  if (!project) notFound();

  /* The French, fetched beside the English rather than instead of it. Four
     queries because there are four kinds of row and each is keyed by its own
     ids, and they run together because none of them needs the others. The
     editing screen is the one place that wants both languages at once: every
     public page asks for one. */
  const [projectFrench, imageFrench, drawingFrench, filmFrench] = await Promise.all([
    translationsFor('fr', 'Project', [project.id]),
    translationsFor(
      'fr',
      'ProjectImage',
      project.imageGroups.flatMap((group) => group.images.map((image) => image.id)),
    ),
    translationsFor(
      'fr',
      'Drawing',
      project.drawings.map((drawing) => drawing.id),
    ),
    translationsFor('fr', 'Film', project.film ? [project.film.id] : []),
  ]);

  const groups = toEditorGroups(project.imageGroups, imageFrench);
  const drawings = toEditorDrawings(project.drawings, drawingFrench);

  const film = project.film
    ? {
        posterMedia: project.film.posterMedia ? toMedia(project.film.posterMedia) : null,
        youtubeId: project.film.youtubeId ?? '',
        caption: project.film.caption ?? '',
        french: toEditorFrench(FILM_FRENCH_FIELDS, filmFrench.get(project.film.id)),
        sources: project.film.sources.map((source) => ({
          height: source.height,
          media: toMedia(source.media),
        })),
      }
    : null;

  return (
    <ProjectForm
      project={{
        id: project.id,
        slug: project.slug,
        title: project.title,
        sheet: project.sheet,
        category: project.category,
        year: project.year,
        location: project.location,
        buildingType: project.buildingType,
        area: project.area ?? '',
        status: project.status,
        role: project.role,
        contribution: project.contribution,
        summary: project.summary,
        body: project.body,
        credit: project.credit,
        tier: project.tier,
        order: project.order,
        updatedAt: project.updatedAt.toISOString(),
        published: project.published,
        leadImageId: project.leadImageId,
        leadImageAlt: project.leadImageAlt,
        leadImage: project.leadImage ? toMedia(project.leadImage) : null,
        french: toEditorFrench(PROJECT_FRENCH_FIELDS, projectFrench.get(project.id)),
      }}
      groups={groups}
      drawings={drawings}
      film={film}
    />
  );
}
