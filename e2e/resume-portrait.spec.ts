import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** Exercise the real profile save and public rendering. Only the file transfer
 * is intercepted, so this cannot upload a test photo into the live R2 bucket.
 * The suite's global setup requires a disposable local database. */
test('a portrait can be uploaded, published, removed, and reused from the library', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'The profile is shared by both browser projects.');
  if (process.env.ACCESS_DEV_BYPASS !== 'true') throw new Error('ACCESS_DEV_BYPASS must be true.');

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const original = await db.profile.findUniqueOrThrow({ where: { id: 'profile' } });
  const picture = readFileSync('public/media/hero-poster.jpg');
  const media = await db.media.create({
    data: {
      key: `profile/portrait-test-${crypto.randomUUID()}.jpg`,
      kind: 'image',
      contentType: 'image/jpeg',
      bytes: picture.length,
      originalName: 'portrait-test.jpg',
      width: 1920,
      height: 1080,
    },
  });
  const alt = 'Portrait selected in the resume editor';

  try {
    await page.route(/\/api\/uploads\/presign\/?$/, async (route) => {
      await route.fulfill({ json: { uploads: [{
        name: media.originalName,
        key: media.key,
        url: new URL('/__portrait-test-upload__', route.request().url()).href,
        contentType: media.contentType,
        kind: 'image',
      }], rejected: [] } });
    });
    await page.route('**/__portrait-test-upload__', route => route.fulfill({ status: 200 }));
    await page.route(/\/api\/uploads\/complete\/?$/, route => route.fulfill({ json: { media } }));
    await page.route(`**/api/media-dev/${media.key}*`, route => route.fulfill({ contentType: 'image/jpeg', body: picture }));

    await page.goto('/admin/resume/');
    const panel = page.getByRole('heading', { name: 'Your portrait', exact: true }).locator('..');
    const save = panel.getByRole('button', { name: 'Save portrait and details' });
    await panel.locator('input[type=file]').setInputFiles({ name: media.originalName, mimeType: media.contentType, buffer: picture });
    await expect(panel.getByText('Your changes are not on the site yet. Save to publish them.')).toBeVisible();
    await panel.getByLabel('What the portrait shows').fill(alt);
    await expect(panel.getByRole('img', { name: alt })).toBeVisible();
    await save.click();
    await expect(panel.getByText('Your portrait is saved on the resume page.')).toBeVisible();

    await page.reload();
    await expect(panel.getByLabel('Previously uploaded portraits')).toHaveValue(media.id);
    await page.goto('/resume/');
    const portrait = page.locator('img.resume-portrait');
    await expect(portrait).toHaveAttribute('alt', alt);
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveJSProperty('complete', true);
    expect(await portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    await page.setViewportSize({ width: 393, height: 851 });
    await expect(portrait).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(portrait).toHaveCSS('opacity', '1');
    await page.screenshot({ path: '/tmp/ahmad-resume-portrait-mobile.png' });

    await page.goto('/admin/resume/');
    await panel.getByRole('button', { name: 'Take this portrait off' }).click();
    await save.click();
    await expect(panel.getByText('No portrait is saved on the resume page.')).toBeVisible();
    await page.goto('/resume/');
    await expect(portrait).toHaveCount(0);

    await page.goto('/admin/resume/');
    await panel.getByLabel('Previously uploaded portraits').selectOption(media.id);
    await save.click();
    await expect(panel.getByText('Your portrait is saved on the resume page.')).toBeVisible();
    await page.goto('/resume/');
    await expect(portrait).toHaveAttribute('alt', alt);
    await expect(portrait).toBeVisible();

    const saved = await db.profile.findUniqueOrThrow({ where: { id: 'profile' } });
    expect(saved.portraitMediaId).toBe(media.id);
    expect(saved.cvMediaId).toBe(original.cvMediaId);
    expect(saved.portfolioMediaId).toBe(original.portfolioMediaId);
    expect(saved.email).toBe(original.email);
  } finally {
    await db.profile.update({
      where: { id: 'profile' },
      data: { portraitMediaId: original.portraitMediaId, portraitAlt: original.portraitAlt },
    });
    await db.media.delete({ where: { id: media.id } });
    await db.$disconnect();
  }
});
