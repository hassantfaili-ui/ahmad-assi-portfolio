/**
 * The three tier split the home page and the portfolio PDF both lay out from.
 *
 * Ported from the Astro site, where it took CollectionEntry objects and read
 * tier and order off a nested .data. The rows come from Prisma now, so the
 * function is generic over anything carrying the two fields it actually looks
 * at. Nothing else about it changed, on purpose: the behaviour below is the
 * whole reason the file exists.
 */

/**
 * Matches the Prisma `Tier` enum structurally, and is declared here rather than
 * imported from it so that a client component can call tiers() without dragging
 * the Prisma client into the browser bundle.
 */
export type TierName = 'lead' | 'set' | 'index';

/**
 * Three, and it is not a preference. The home page layout has exactly three
 * lead slots, and everything below depends on the count being fixed.
 */
const LEAD_LIMIT = 3;

/**
 * Order first, then id.
 *
 * The id is not decoration. `order` is `@default(99)` in the schema, so every
 * project created without an explicit reorder shares the same value, and a sort
 * on order alone leaves those ties to whatever sequence Postgres happened to
 * return. Which project leads the home page, and which fourth lead gets demoted
 * into the strip, would then change between two requests with no data change at
 * all. src/lib/queries.ts orders by id as its second key for the same reason.
 */
function byOrderThenId<T extends { id: string; order: number }>(a: T, b: T): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Split projects into leads, the strip, and the index.
 *
 * This lives in one place because the home page and the PDF used to work it out
 * separately and had already drifted apart. The home page took the first three
 * leads and threw the rest away, while the PDF gave every project marked lead a
 * full spread. So a fourth lead vanished from the home page completely: sliced
 * out of the leads, and kept out of the strip and the index by its own tier. It
 * was still in the PDF. Nothing warned about either half of that.
 *
 * It matters because marking a fourth project as a lead is an obvious thing for
 * Ahmad to try, and a project silently disappearing off the front page is the
 * worst possible answer to it.
 *
 * So the rule: only three can lead, and any beyond that fall through into the
 * strip in their normal position by order rather than disappearing. Worst case
 * he gets a layout he did not quite intend, which he can see and undo, instead
 * of losing a project with no error anywhere.
 *
 * If you are here to lift the limit or to drop the overflow, read that again
 * first. The administration area warns about a fourth lead at save time, but
 * this function is what makes the warning true.
 */
export function tiers<T extends { id: string; tier: TierName; order: number }>(
  projects: T[],
): { leads: T[]; set: T[]; index: T[] } {
  // Copied before sorting: sort mutates, and callers pass query results that
  // other parts of the page are still reading in their own order.
  const byOrder = [...projects].sort(byOrderThenId);

  const marked = byOrder.filter((project) => project.tier === 'lead');
  const leads = marked.slice(0, LEAD_LIMIT);
  const overflow = marked.slice(LEAD_LIMIT);

  // Merged and re-sorted rather than spliced in, so a demoted lead lands
  // exactly where its order says it belongs among the rest of the strip.
  //
  // Three keys, in this order. Order first, obviously. Then demotion, so a
  // genuine set project keeps the earlier slot when the two share an order
  // value: the demotion never pushes past something Ahmad placed deliberately.
  // Then id, so the remaining ties are decided by the data rather than by the
  // sequence Postgres happened to return.
  //
  // The demotion key used to be implicit, carried by a stable sort over an
  // array built in the right order. That was correct only as long as the input
  // order was itself meaningful, and coming out of a query it is not.
  const set = [
    ...byOrder.filter((project) => project.tier === 'set').map((project) => ({ project, demoted: 0 })),
    ...overflow.map((project) => ({ project, demoted: 1 })),
  ]
    .sort(
      (a, b) =>
        a.project.order - b.project.order ||
        a.demoted - b.demoted ||
        byOrderThenId(a.project, b.project),
    )
    .map((entry) => entry.project);

  // The complement, not a third positive match on 'index'.
  //
  // A positive match loses anything whose tier is none of the three, which is
  // the exact failure this file exists to prevent. TypeScript is not enough on
  // its own: the rows arrive through a cast in src/lib/queries.ts, and the
  // Prisma enum could gain a member. Written as the complement, nothing can be
  // dropped by construction.
  const index = byOrder.filter((project) => project.tier !== 'lead' && project.tier !== 'set');

  return { leads, set, index };
}
