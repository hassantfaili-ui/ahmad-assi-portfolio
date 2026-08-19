import { NextResponse } from 'next/server';

import { requireIdentityOr401 } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { deleteObject } from '@/lib/r2';

/**
 * Delete a file, but only once nothing points at it.
 *
 * Reference aware on purpose. The alternative, letting a delete cascade or
 * null out whatever referred to the file, means Ahmad tidying the media library
 * can silently blank an image on a published project page, and he would have no
 * way to know until he looked. So a file in use refuses to go, and names what is
 * still using it.
 *
 * Order matters at the end: the object goes first, then the row. The other way
 * round leaves an object in the bucket that nothing knows about, which nobody
 * will ever find. This way a failure leaves a row whose object is gone, which
 * the migration's verify step reports by name.
 */

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const unauthorised = await requireIdentityOr401();
  if (unauthorised) return unauthorised;

  const { id } = await context.params;

  const media = await db.media.findUnique({
    where: { id },
    include: {
      leadFor: { select: { title: true } },
      projectImages: { select: { group: { select: { project: { select: { title: true } } } } } },
      drawings: { select: { project: { select: { title: true } } } },
      filmSources: { select: { film: { select: { project: { select: { title: true } } } } } },
      filmPosters: { select: { project: { select: { title: true } } } },
      profilePortrait: { select: { id: true } },
      profileCv: { select: { id: true } },
      profilePortfolio: { select: { id: true } },
    },
  });

  if (!media) {
    return NextResponse.json({ error: 'That file is not in the library.' }, { status: 404 });
  }

  const used: string[] = [
    ...media.leadFor.map((p) => `${p.title}, as its cover`),
    ...media.projectImages.map((i) => i.group.project.title),
    ...media.drawings.map((d) => `${d.project.title}, as a drawing`),
    ...media.filmSources.map((s) => `${s.film.project?.title ?? 'the site hero'}, as a film`),
    ...media.filmPosters.map((f) => `${f.project?.title ?? 'the site hero'}, as a film poster`),
    ...media.profilePortrait.map(() => 'your profile, as the portrait'),
    ...media.profileCv.map(() => 'your profile, as the resume PDF'),
    ...media.profilePortfolio.map(() => 'your profile, as the portfolio PDF'),
  ];

  if (used.length > 0) {
    const unique = [...new Set(used)];
    return NextResponse.json(
      {
        error: `That file is still used by ${unique.join(', ')}. Remove it there first.`,
        usedBy: unique,
      },
      { status: 409 },
    );
  }

  await deleteObject(media.key);
  await db.media.delete({ where: { id } });

  return NextResponse.json({ deleted: media.key });
}
