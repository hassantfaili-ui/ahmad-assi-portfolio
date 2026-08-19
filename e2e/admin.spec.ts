import { test, expect, type Page } from '@playwright/test';

/**
 * The editing area, in a browser.
 *
 * Until this file existed, no browser test had ever touched an editing screen.
 * A full unit run and a full Playwright run both went green while the
 * navigation bar above every editor discarded unsaved work without asking,
 * which is exactly the sort of thing only a real click finds.
 *
 * These run against the development server with ACCESS_DEV_BYPASS on, which is
 * how a developer's machine is set up. That is a deliberate limitation worth
 * naming: it exercises the screens, not the Cloudflare Access gate in front of
 * them. The gate is Cloudflare's to enforce and the application verifies the
 * assertion again itself; neither is testable from here.
 */

test.skip(
  process.env.ACCESS_DEV_BYPASS !== 'true',
  'The editing area needs ACCESS_DEV_BYPASS to be reachable without a Cloudflare tunnel',
);

/** A title nothing else will collide with, so a stray run cannot break a real project. */
function scratchTitle(): string {
  return `Test Project ${process.env.TEST_WORKER_INDEX ?? '0'} ${Math.floor(performance.now())}`;
}

async function createProject(page: Page, title: string) {
  await page.goto('/admin');
  await page.getByLabel(/title/i).first().fill(title);
  await page.getByRole('button', { name: /new project|add|create/i }).first().click();
  await page.waitForURL(/\/admin\/projects\//);
}

async function deleteProject(page: Page, title: string) {
  await page.goto('/admin');
  const row = page.locator('li', { hasText: title }).first();
  if ((await row.count()) === 0) return;
  await row.getByRole('button', { name: /delete|remove/i }).first().click();
  await page.getByRole('button', { name: new RegExp(`Delete ${title}`, 'i') }).click();
  await expect(page.locator('li', { hasText: title })).toHaveCount(0);
}

test.describe('the projects list', () => {
  test('shows every project, published or not', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The migrated set is eighteen. This asserts the screen reads the database
    // rather than that the number is exactly right forever.
    expect(await page.locator('[data-project-row], li').count()).toBeGreaterThan(5);
  });

  test('the navigation bar reaches every screen', async ({ page }) => {
    await page.goto('/admin');
    for (const [label, path] of [
      ['Media', '/admin/media'],
      ['Resume', '/admin/resume'],
      ['Settings', '/admin/settings'],
      ['Projects', '/admin'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(new RegExp(path.replace('/', '\\/')));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('the editing screens all render', () => {
  for (const path of ['/admin', '/admin/media', '/admin/resume', '/admin/settings']) {
    test(`${path} renders without a client exception`, async ({ page }) => {
      const failures: string[] = [];
      page.on('pageerror', (error) => failures.push(error.message));

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // The error boundary's own text. Seeing it means the screen threw.
      await expect(page.getByText('Something went wrong on this screen')).toHaveCount(0);
      expect(failures, `page errors on ${path}`).toEqual([]);
    });
  }
});

test.describe('unsaved work', () => {
  test('the navigation bar asks before discarding it', async ({ page }) => {
    const title = scratchTitle();
    try {
      await createProject(page, title);

      // Type into the form without saving.
      const summary = page.getByLabel(/summary/i).first();
      await summary.fill('A sentence that has not been saved.');
      await expect(page.getByText(/not saved yet/i).first()).toBeVisible();

      // The exact click that used to lose everything with no prompt.
      await page.getByRole('link', { name: 'Resume', exact: true }).click();

      await expect(page.getByText('Leave without saving?')).toBeVisible();

      await page.getByRole('button', { name: 'Cancel' }).click();
      expect(page.url()).toContain('/admin/projects/');
      await expect(summary).toHaveValue('A sentence that has not been saved.');
    } finally {
      await deleteProject(page, title);
    }
  });

  test('leaving is still possible once confirmed', async ({ page }) => {
    const title = scratchTitle();
    try {
      await createProject(page, title);
      await page.getByLabel(/summary/i).first().fill('Unsaved.');

      await page.getByRole('link', { name: 'Media', exact: true }).click();
      await page.getByRole('button', { name: 'Leave and lose the changes' }).click();

      await page.waitForURL(/\/admin\/media/);
    } finally {
      await deleteProject(page, title);
    }
  });

  test('says nothing when there is nothing outstanding', async ({ page }) => {
    await page.goto('/admin/media');
    await page.getByRole('link', { name: 'Resume', exact: true }).click();
    await page.waitForURL(/\/admin\/resume/);
    await expect(page.getByText('Leave without saving?')).toHaveCount(0);
  });
});

test.describe('a project round trip', () => {
  test('a new project is created unpublished and can be deleted again', async ({ page }) => {
    const title = scratchTitle();
    try {
      await createProject(page, title);
      expect(page.url()).toMatch(/\/admin\/projects\//);

      await page.goto('/admin');
      const row = page.locator('li', { hasText: title }).first();
      await expect(row).toBeVisible();

      // Unpublished, because a project with no images and no credit appearing
      // on the public site the moment it is named would be worse than either.
      await expect(row.getByText(/not published|unpublished|draft/i).first()).toBeVisible();
    } finally {
      await deleteProject(page, title);
    }
  });
});
