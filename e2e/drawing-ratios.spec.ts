import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { test, expect } from '@playwright/test';

/* Global setup refuses a live database. Reuse an existing image so this test
   exercises saving and rendering a crop without uploading to the live bucket. */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

test.beforeAll(() => {
  if (process.env.SKIP_ADMIN_E2E === 'true') {
    test.skip(true, 'SKIP_ADMIN_E2E is set');
    return;
  }
  if (process.env.ACCESS_DEV_BYPASS !== 'true') {
    throw new Error('The drawing editor test needs ACCESS_DEV_BYPASS="true".');
  }
});
test.afterAll(async () => db.$disconnect());

test('a drawing’s ratio and focus survive saving and render on its public page', async ({ page }, info) => {
  const candidates = await db.media.findMany({
    where: { kind: 'image', width: { gt: 0 }, height: { gt: 0 } },
  });
  const media = candidates.find((row) => row.width! * 2 !== row.height! * 3);
  if (!media) throw new Error('Seed the test database with an image whose original shape is not 3:2.');
  const slug = `test-drawing-crop-${info.workerIndex}-${Date.now()}`;
  const project = await db.project.create({ data: {
    slug, title: `Test Project Drawing ${info.workerIndex}`, sheet: 'A-999',
    category: 'Academic', status: 'Academic', year: 2026, location: 'Ottawa',
    buildingType: 'Test fixture', role: 'Designer', contribution: 'All of it',
    summary: 'A disposable drawing crop test.', credit: 'Sole author',
    tier: 'index', published: true,
    drawings: { create: { mediaId: media.id, alt: 'Ground floor plan', drawingType: 'Plan' } },
  } });

  try {
    await page.goto(`/admin/projects/${project.id}/`);
    const shapes = page.getByRole('radiogroup', { name: 'Shape of Ground floor plan' });
    await shapes.getByRole('radio', { name: '3:2', exact: true }).click();
    const preview = page.getByRole('button', { name: /Which part of Ground floor plan stays/ });
    await preview.press('ArrowRight');
    await preview.press('ArrowDown');
    await page.getByRole('button', { name: 'Save everything', exact: true }).click();
    await expect(page.getByText('Not saved yet', { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(shapes.getByRole('radio', { name: '3:2', exact: true })).toHaveAttribute('aria-checked', 'true');
    const drawing = await db.drawing.findFirstOrThrow({ where: { projectId: project.id } });
    expect(drawing).toMatchObject({ ratio: '3:2', focusX: 0.55, focusY: 0.55 });

    await page.goto(`/work/${slug}/`);
    const sheet = page.locator('.sheets img');
    const width = Number(await sheet.getAttribute('width'));
    const height = Number(await sheet.getAttribute('height'));
    expect(width / height).toBeCloseTo(1.5, 2);
    await expect(sheet).toHaveCSS('object-position', '55% 55%');

    await page.goto(`/admin/projects/${project.id}/`);
    await shapes.getByRole('radio', { name: 'Auto', exact: true }).click();
    await page.getByRole('button', { name: 'Save everything', exact: true }).click();
    await expect(page.getByText('Not saved yet', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(shapes.getByRole('radio', { name: 'Auto', exact: true })).toHaveAttribute('aria-checked', 'true');

    await page.goto(`/work/${slug}/`);
    await expect(sheet).toHaveAttribute('width', String(media.width));
    await expect(sheet).toHaveAttribute('height', String(media.height));
  } finally {
    await db.project.delete({ where: { id: project.id } });
  }
});
