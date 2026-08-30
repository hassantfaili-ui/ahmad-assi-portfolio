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
      count: vi.fn(async () => 0),
    },
    $transaction: vi.fn(async (...args: unknown[]) => {
      void args;
      return [] as unknown[];
    }),
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

/**
 * The caption has to survive the write, not merely the payload.
 *
 * It once did not. The type accepted a caption per picture, the screen sent
 * one, and the create that actually writes the row left the field out, so
 * every save wrote nothing over whatever was there. Ahmad lost fifteen
 * captions in one press and the screen said Saved. The test that existed
 * asserted the payload the screen builds, which was right the whole time, so
 * it stayed green throughout.
 *
 * This asserts the write itself: what saveWholeProject hands to the database.
 */
describe('what a whole project save writes for each picture', () => {
  it('carries the caption and the description onto the row it creates', async () => {
    const { saveWholeProject } = await import('./mutations');

    db.project.findUnique.mockResolvedValue({ slug: 'a-project' });
    db.project.findMany.mockResolvedValue([]);
    db.project.count.mockResolvedValue(0);

    const created: unknown[] = [];
    db.$transaction.mockImplementation(async (...args: unknown[]) => {
      const run = args[0];
      if (typeof run !== 'function') return [];
      const tx = {
        project: { update: vi.fn() },
        imageGroup: { deleteMany: vi.fn(), create: vi.fn((args: unknown) => created.push(args)) },
        drawing: { deleteMany: vi.fn(), createMany: vi.fn() },
        film: { deleteMany: vi.fn(), create: vi.fn() },
      };
      await (run as (tx: unknown) => Promise<unknown>)(tx);
      return [];
    });

    await saveWholeProject('p1', {
      fields: {
        title: 'A project', slug: 'a-project', sheet: 'A-101', category: 'Residential',
        year: 2024, location: 'Ottawa', buildingType: 'House', area: '', status: 'Built',
        role: 'Designer', contribution: 'All of it', summary: 'A summary of the project.',
        body: '', credit: 'Sole author', tier: 'index', order: 1,
        leadImageId: null, leadImageAlt: '',
      },
      published: false,
      groups: [
        {
          layout: 'pair',
          images: [
            { mediaId: 'm1', alt: 'The courtyard', caption: 'Phase two, from the street' },
            { mediaId: 'm2', alt: 'The lookout', caption: null },
          ],
        },
      ],
      drawings: [],
      film: null,
    });

    const images = (created[0] as { data: { images: { create: { alt: string; caption: string | null }[] } } })
      .data.images.create;

    expect(images[0]).toMatchObject({ alt: 'The courtyard', caption: 'Phase two, from the street' });
    /* Absent stays absent rather than becoming an empty string, so the page
       prints no caption at all instead of an empty line under the picture. */
    expect(images[1]).toMatchObject({ alt: 'The lookout', caption: null });
  });
})
