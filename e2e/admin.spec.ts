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

/**
 * This suite needs ACCESS_DEV_BYPASS, and it FAILS rather than skips without it.
 *
 * A file level skip is how an entire suite disappears. The flag lives in .env,
 * which is gitignored, so on any other machine or any CI runner every test here
 * would quietly not run and the command would still exit 0. A green run would
 * then mean the editing screens were never opened, which is the opposite of
 * what a green run is supposed to mean.
 *
 * Set SKIP_ADMIN_E2E=true to opt out deliberately. Anything else is a failure.
 */
test.beforeAll(() => {
  if (process.env.SKIP_ADMIN_E2E === 'true') {
    test.skip(true, 'SKIP_ADMIN_E2E is set');
    return;
  }
  if (process.env.ACCESS_DEV_BYPASS !== 'true') {
    throw new Error(
      'The editing area needs ACCESS_DEV_BYPASS="true" to be reachable without a Cloudflare ' +
        'tunnel. Set it, or set SKIP_ADMIN_E2E=true to skip this suite on purpose.',
    );
  }
});

/** A title nothing else will collide with, so a stray run cannot break a real project. */
function scratchTitle(): string {
  return `Test Project ${process.env.TEST_WORKER_INDEX ?? '0'} ${Math.floor(performance.now())}`;
}

/**
 * Locators are asserted before they are used.
 *
 * The first version of this file guessed that the new project field was
 * labelled something containing "title". It is labelled "Add a project", so the
 * locator matched nothing and fill() sat there until the thirty second test
 * timeout, then reported a failure in the cleanup block, pointing at the wrong
 * line entirely. Three tests, including both of the ones that prove the unsaved
 * work guard, never ran once.
 *
 * So every locator here is checked first. A renamed label now fails in a second
 * with a message naming the control, instead of timing out somewhere else.
 */
async function expectVisible(page: Page, locator: ReturnType<Page['getByLabel']>, what: string) {
  await expect(locator, `could not find ${what}`).toBeVisible({ timeout: 5000 });
  return locator;
}

async function createProject(page: Page, title: string) {
  await page.goto('/admin');

  const field = await expectVisible(
    page,
    page.getByLabel('Add a project'),
    'the new project title field',
  );
  await field.fill(title);

  const button = page.getByRole('button', { name: 'Add project' });
  await expect(button, 'could not find the add project button').toBeVisible({ timeout: 5000 });
  await button.click();

  await page.waitForURL(/\/admin\/projects\//, { timeout: 15_000 });
}

async function deleteProject(page: Page, title: string) {
  await page.goto('/admin');

  const remove = page.getByRole('button', { name: `Delete ${title}` });
  if ((await remove.count()) === 0) return;

  await remove.first().click();
  await page.getByRole('button', { name: `Delete ${title}`, exact: true }).last().click();
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);
}

test.describe('the projects list', () => {
  test('shows every project, published or not', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Every project links to its own editor, so the links are the row count.
    // Asserting more than a handful rather than exactly eighteen, because the
    // point is that the screen reads the database, not that the number is
    // frozen forever.
    expect(await page.getByRole('link', { name: /./ }).count()).toBeGreaterThan(5);
    await expect(page.getByRole('link', { name: 'Lincoln Beach Center' })).toBeVisible();
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
      const summary = await expectVisible(page, page.getByLabel('Summary'), 'the summary field');
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
      const summary = await expectVisible(page, page.getByLabel('Summary'), 'the summary field');
      await summary.fill('Unsaved.');

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
      await expect(page.getByRole('link', { name: title })).toBeVisible();

      // Unpublished, because a project with no images and no credit appearing
      // on the public site the moment it is named would be worse than either.
      //
      // Asserted on the switch rather than on the words "Not published", which
      // appear twice in the row: once as the badge and once as the switch's own
      // label. The switch is the state; the badge is a description of it.
      const row = page.locator('li', { has: page.getByRole('link', { name: title }) }).first();
      await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    } finally {
      await deleteProject(page, title);
    }
  });
});
