/**
 * Everything the site reads, in one place.
 *
 * This replaced `astro:content`. Not because the content moved, it did not:
 * the projects are still one markdown file each in src/content/projects and the
 * resume is still src/data/resume.json. What changed is who parses them.
 *
 * The editor is the reason. Tina's inline editing works by rendering the real
 * page inside the admin and swapping fresh HTML into it as Ahmad types, and it
 * can only do that for data that came through `requestWithMetadata`, which tags
 * every field with where it came from. A page fed by `getCollection` is just as
 * correct and completely uneditable: nothing on it can be clicked, because
 * nothing on it knows which field drew it. Two sources would mean two shapes to
 * keep in step and a page that edits differently from the way it renders, so
 * there is one, and this is it.
 *
 * The content collection's zod schema went with it, so the guarantees it made
 * are re-made here in `assertUsable`, at build time, loudly.
 */
import { requestWithMetadata } from '@tinacms/astro/data';
import { client } from '../../tina/__generated__/client';

/**
 * One project, with the metadata that makes it editable.
 *
 * `priority: 'primary'` tells the admin which document to open when the page
 * loads. Without it a page that also pulls the resume in for the header would
 * present Ahmad with a picker asking which of the two he meant, every time.
 */
export const getProject = (slug: string) =>
  requestWithMetadata(client.queries.projects({ relativePath: `${slug}.md` }), {
    priority: 'primary',
  });

/** The resume record, which drives the resume page, the contact page and the footer. */
export const getResume = () =>
  requestWithMetadata(client.queries.resume({ relativePath: 'resume.json' }));

/* Derived from the queries rather than written out, and derived from the query
   result rather than the schema type. A document as *queried* is not the whole
   type: it carries the fields the generated fragment selects and no others, so
   naming the schema type here would promise components fields that never
   arrive. Change the collection, regenerate, and every consumer updates. */
export type Project = Awaited<ReturnType<typeof getProject>>['data']['projects'];
export type ResumeDoc = Awaited<ReturnType<typeof getResume>>['data']['resume'];

type ImageGroup = NonNullable<NonNullable<Project['imageGroups']>[number]>;

/** The slug a project is published at, which is its filename. */
export const slugOf = (p: Pick<Project, '_sys'>): string => p._sys.filename;

/**
 * Every project, in Ahmad's order.
 *
 * Sorted here rather than at each call site because the order is his and is not
 * a per-page decision. A project with no order set sorts last rather than first,
 * which is what an unset number should mean.
 *
 * The connection query selects the same fragment as the single-document one, so
 * a node from it is a Project in every field a page reads.
 */
export async function listProjects(): Promise<Project[]> {
  const result = await client.queries.projectsConnection();
  const nodes = (result.data.projectsConnection.edges ?? []).flatMap((edge) =>
    edge?.node ? [edge.node as Project] : [],
  );
  nodes.forEach(assertUsable);
  return nodes.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * The film for a project, or nothing.
 *
 * Tina writes an object for a field group the moment anything in it is touched,
 * so `film: {}` and `film: { caption: 'x' }` are both reachable states from the
 * editor and neither is a film. A film is a poster frame plus something to play:
 * an uploaded file, or a YouTube id. Anything less is treated as absent, which
 * renders no film section rather than a broken player or a missing poster.
 *
 * This is the check the content schema used to make with `.refine()`. It is not
 * an error, because half-filling a group is an ordinary thing to do while
 * writing and must not fail a deploy.
 *
 * Returned as it came, metadata and all, for the same reason as the images
 * below: a rebuilt object cannot be clicked into from the editor.
 */
export function filmOf(p: Project) {
  const f = p.film;
  if (!f?.poster) return null;
  if (!f.src && !f.youtube) return null;
  return f as typeof f & { poster: string };
}

/**
 * Image groups and drawings, with the empty slots Tina can leave behind removed.
 *
 * These filter and never rebuild. That looks like a style choice and is not:
 * `requestWithMetadata` hangs a `_content_source` marker off every object in the
 * response, and that marker is the only thing that tells the editor which field
 * a photograph on the page came from. Copying a slot into a fresh `{ src, alt }`
 * drops it, and the picture silently stops being clickable in the editor while
 * looking perfectly correct on the site. So the original objects are passed
 * through untouched.
 */
export function imageGroupsOf(p: Project): ImageGroup[] {
  return (p.imageGroups ?? []).flatMap((g) => (g && imagesOf(g).length > 0 ? [g] : []));
}

export function imagesOf(group: ImageGroup) {
  return (group.images ?? []).flatMap((i) => (hasImage(i) ? [i] : []));
}

export function drawingsOf(p: Project) {
  return (p.drawings ?? []).flatMap((d) => (hasImage(d) ? [d] : []));
}

/** A slot is worth rendering once it has both halves. One without the other is
    a half-filled form, not a picture, and drawing it produces either a broken
    image or an unlabelled one. */
function hasImage<T extends { src?: string | null; alt?: string | null }>(
  slot: T | null | undefined,
): slot is T & { src: string; alt: string } {
  return Boolean(slot?.src && slot.alt);
}

/**
 * The things that used to be enforced by zod, enforced at build time instead.
 *
 * Tina's own `required` catches these in the editor, which is where nearly all
 * of them will ever be caught. This is the backstop for the other route in: a
 * file edited by hand, or a merge that lost a line. It throws rather than warns
 * on purpose. A project card with no picture and a photograph with no alt text
 * are both worse published than not deployed, and finding out from the build is
 * how the content collection used to work.
 */
function assertUsable(p: Project): void {
  const where = `src/content/projects/${p._sys.filename}.md`;
  const fail = (why: string): never => {
    throw new Error(`${where}: ${why}`);
  };

  if (!p.leadImage?.src) fail('needs a lead image, which is the card on the projects page');
  if (!p.leadImage?.alt) fail('the lead image needs alt text');
  if (!/^A-\d{3}$/.test(p.sheet)) fail(`sheet number "${p.sheet}" should look like A-107`);
  if (!p.credit) fail('needs a credit saying who did the work');

  for (const group of p.imageGroups ?? []) {
    for (const image of group?.images ?? []) {
      if (image?.src && !image.alt) fail(`the image ${image.src} has no alt text`);
    }
  }
  for (const drawing of p.drawings ?? []) {
    if (drawing?.src && !drawing.alt) fail(`the drawing ${drawing.src} has no alt text`);
  }
}

/**
 * The lead image, which `assertUsable` has already proved is there.
 *
 * Every page that draws a card would otherwise have to re-check a thing the
 * build refuses to publish without, and a `!` at each of those call sites says
 * nothing about why it is safe. This says it once.
 */
export function leadImageOf(p: Project): { src: string; alt: string } {
  return { src: p.leadImage?.src ?? '', alt: p.leadImage?.alt ?? '' };
}
