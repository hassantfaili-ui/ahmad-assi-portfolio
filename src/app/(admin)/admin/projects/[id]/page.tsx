import { notFound } from 'next/navigation';

import { ProjectForm } from '@/components/admin/ProjectForm';
import type { EditorMedia } from '@/components/admin/MediaPanel';
import { getProjectForEditing } from '@/lib/admin-queries';

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
  const { id } = await params;
  const project = await getProjectForEditing(id);

  /* A project deleted in another tab, or a link that was pasted wrong. Either
     way there is nothing to edit, and the 404 says so. */
  if (!project) notFound();

  const groups = project.imageGroups.map((group) => ({
    id: group.id,
    layout: group.layout,
    caption: group.caption ?? '',
    images: group.images.map((image) => ({
      id: image.id,
      mediaId: image.mediaId,
      alt: image.alt,
      media: toMedia(image.media),
    })),
  }));

  const drawings = project.drawings.map((drawing) => ({
    id: drawing.id,
    mediaId: drawing.mediaId,
    alt: drawing.alt,
    drawingType: drawing.drawingType,
    media: toMedia(drawing.media),
  }));

  const film = project.film
    ? {
        posterMedia: project.film.posterMedia ? toMedia(project.film.posterMedia) : null,
        youtubeId: project.film.youtubeId ?? '',
        caption: project.film.caption ?? '',
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
        published: project.published,
        leadImageId: project.leadImageId,
        leadImageAlt: project.leadImageAlt,
        leadImage: project.leadImage ? toMedia(project.leadImage) : null,
      }}
      groups={groups}
      drawings={drawings}
      film={film}
    />
  );
}
