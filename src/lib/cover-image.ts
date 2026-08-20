/**
 * Which picture stands for a project when nobody has chosen one.
 *
 * The cover is what every listing shows: the cards on the home page and on
 * Architecture are a photograph with the title over it. A project with no cover
 * is not a card with a gap in it, it is a card with nothing in it, so it reads
 * as broken next to the others even though the project itself is fine and its
 * own page shows every picture on it.
 *
 * That is easy to arrive at without doing anything wrong. Ahmad adds a project,
 * drops renders into a group, saves, and the project page looks right. The
 * cover is a separate box he has not filled in yet, and nothing on the page he
 * is looking at tells him the card elsewhere is empty.
 *
 * So a project with pictures gets a cover whether or not one was chosen: the
 * first picture of the first group, which is the one at the top of the screen
 * and the obvious candidate. Choosing a cover still overrides it, and a project
 * with no pictures at all still has none, because there is nothing to use.
 */
export interface CoverCandidate {
  images: { mediaId: string; alt: string }[];
}

export interface Cover {
  leadImageId: string | null;
  leadImageAlt: string;
}

export function resolveCover(
  chosenId: string | null | undefined,
  chosenAlt: string | null | undefined,
  groups: CoverCandidate[],
): Cover {
  if (chosenId) {
    return { leadImageId: chosenId, leadImageAlt: (chosenAlt ?? '').trim() };
  }

  const first = groups.flatMap((group) => group.images)[0];
  if (!first) return { leadImageId: null, leadImageAlt: '' };

  /* The picture's own description carries over, because it describes the same
     photograph and a cover with no description is one that a screen reader
     announces as nothing at all. */
  return { leadImageId: first.mediaId, leadImageAlt: first.alt.trim() };
}
