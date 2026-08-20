import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a project write regenerates.
 *
 * The set matters more than it looks. Every project page carries prev and next
 * links to its neighbours by running order, so deleting, unpublishing or
 * reordering one project changes pages whose rows were never touched. Before
 * the pattern revalidation below, a cached neighbour kept pointing at a
 * project that was gone, and the sitemap kept advertising it, until the next
 * redeploy.
 *
 * The paths are spelled out literally rather than read from cache-tags.ts,
 * for the reason that file itself gives: a path typed slightly wrong is a page
 * that silently never updates, and a test that derives its expectations from
 * the code under test would agree with the typo.
 */

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

/* Signed in throughout. The refusal path is asserted structurally for every
   action by route-guards.test.ts. */
vi.mock('@/lib/access', () => ({
  getIdentity: vi.fn(async () => ({ email: 'ahmad@example.ca', sub: 'one' })),
}));

const { db } = vi.hoisted(() => ({
  db: {
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async () => []),
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import { deleteProject, reorderProjects, setProjectPublished } from './mutations';

/* The listings, the project's own page, every other project page by pattern,
   and the sitemap. In this order, which is the order the code walks them. */
const EVERYTHING_A_PROJECT_TOUCHES = [
  ['/'],
  ['/architecture'],
  ['/print'],
  ['/work/garden-heights'],
  ['/work/[slug]', 'page'],
  ['/sitemap.xml'],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteProject', () => {
  it('regenerates the neighbours and the sitemap, not just its own pages', async () => {
    db.project.findUnique.mockResolvedValue({ slug: 'garden-heights' });

    const result = await deleteProject('p1');

    expect(result.ok).toBe(true);
    expect(revalidatePath.mock.calls).toEqual(EVERYTHING_A_PROJECT_TOUCHES);
  });
});

describe('setProjectPublished', () => {
  it('unpublishing regenerates the same set, so no prev or next link survives it', async () => {
    db.project.findUnique.mockResolvedValue({ slug: 'garden-heights' });
    db.project.update.mockResolvedValue({});

    const result = await setProjectPublished('p1', false);

    expect(result.ok).toBe(true);
    expect(revalidatePath.mock.calls).toEqual(EVERYTHING_A_PROJECT_TOUCHES);
  });
});

describe('reorderProjects', () => {
  it('regenerates every project page, because prev and next follow the running order', async () => {
    db.project.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const result = await reorderProjects(['a', 'b']);

    expect(result.ok).toBe(true);
    expect(revalidatePath.mock.calls).toEqual([
      ['/'],
      ['/architecture'],
      ['/print'],
      ['/work/[slug]', 'page'],
      ['/sitemap.xml'],
    ]);
  });
});
