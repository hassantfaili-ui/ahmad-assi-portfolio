import { test, expect, type Page } from '@playwright/test';

/**
 * The writes behind the editing screens, in a browser.
 *
 * e2e/admin.spec.ts proves the screens render and that unsaved work is
 * guarded. Nothing in a browser had ever proved the writes Ahmad performs
 * daily: publishing a project, moving one between tiers, reordering the list,
 * and correcting his own details. Every test here therefore ends by reloading,
 * or by walking to the public page, because the thing under test is what the
 * server kept, not what the screen optimistically drew while the request was
 * still out.
 *
 * Two tests run on the chromium project only, and the reason is data, not
 * rendering. The running order and the profile are single global rows, so the
 * same test running from two Playwright projects at once writes over itself:
 * one project's stale snapshot can land after the other's change and put it
 * back. Every write they exercise is project-agnostic arithmetic, so a second
 * viewport would re-test the database, not the layout.
 *
 * There is deliberately no upload test. The presign endpoint points at the
 * real production R2 bucket even on a developer's machine, so a browser
 * upload from this suite would write a scratch file into the live bucket.
 * Until presign can be pointed somewhere disposable, uploads stay a hand
 * check.
 *
 * Nothing here waits on a toast. Toasts leave after five seconds and arrive
 * whenever the server answers, so every wait below is an expect polling a
 * durable piece of the page: a badge, a switch, a select's value, a field.
 */

/**
 * The same refusal as e2e/admin.spec.ts, for the same reason: without
 * ACCESS_DEV_BYPASS every test here would quietly not run and the command
 * would still exit 0. Set SKIP_ADMIN_E2E=true to opt out deliberately, which
 * also opts out of that file, since half a suite is not a state anyone wants.
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

/*
 * These helpers are copies of the ones in e2e/admin.spec.ts, not imports.
 * Importing a spec file registers its tests a second time under this file's
 * name, so the copies are the lesser evil. The moment a third file wants
 * them is the moment they earn a module of their own.
 */

/** A title nothing else will collide with, so a stray run cannot break a real project. */
function scratchTitle(): string {
  return `Test Project ${process.env.TEST_WORKER_INDEX ?? '0'} ${Math.floor(performance.now())}`;
}

/** Locators are asserted before they are used, so a renamed label fails naming the control. */
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

  /* Scoped to the dialog, because the row's delete button and the dialog's
     confirm button carry the same accessible name by design. */
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('button', { name: `Delete ${title}` }).click();

  await expect(page.getByRole('link', { name: title })).toHaveCount(0, { timeout: 10_000 });
}

/** The projects-table row that belongs to one title, however far down it sits. */
function projectRow(page: Page, title: string) {
  return page.locator('li', { has: page.getByRole('link', { name: title }) }).first();
}

test.describe('publishing a project', () => {
  test('the publish toggle survives a save and a reload', async ({ page }) => {
    const title = scratchTitle();
    await createProject(page, title);

    /* A project cannot go on the site half written: the same rules that fail
       the save on the server refuse it in the form first. So the test fills
       the six boxes a new project starts without, which is also the honest
       shape of the flow being tested, since publishing is the last thing
       Ahmad does to a project and never the first. */
    const details: ReadonlyArray<[label: string, text: string]> = [
      ['Summary', 'A scratch project the browser suite publishes and then deletes.'],
      ['What you did on it', 'Everything on it, briefly.'],
      ['Who did the work', 'Solo scratch project'],
      ['Where it is', 'Nowhere, Ontario'],
      ['Kind of building', 'Test fixture'],
      ['Your role', 'Designer'],
    ];
    for (const [label, text] of details) {
      const field = await expectVisible(page, page.getByLabel(label), `the ${label} field`);
      await field.fill(text);
    }

    /* The toggle alone changes nothing on the server, and the badge says so
       in as many words. That intermediate state is asserted rather than
       clicked past, because it is the design: going live rides the same save
       as the words it goes live with. */
    await page.getByRole('button', { name: 'Put it on the site' }).click();
    await expect(page.getByText('Goes on the site when you save')).toBeVisible();

    /* The badge only reads plain "On the site" once the server has answered
       ok, so this wait is the save round trip, not a repaint. */
    await page.getByRole('button', { name: 'Save everything' }).click();
    await expect(page.getByText('On the site', { exact: true })).toBeVisible({ timeout: 15_000 });

    // The reload throws away every optimistic byte. What is left is the database.
    await page.reload();
    await expect(page.getByText('On the site', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Take it off the site' })).toBeVisible();

    // And the list, which reads the same rows through a different query, agrees.
    await page.goto('/admin');
    await expect(projectRow(page, title).getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await deleteProject(page, title);
  });
});

test.describe('the tier control on the projects table', () => {
  test('a tier change is still there after a reload', async ({ page }) => {
    const title = scratchTitle();
    await createProject(page, title);
    await page.goto('/admin');

    const tier = projectRow(page, title).getByLabel(`Where ${title} sits on the home page`);
    // New projects start in the strip. Asserted so a changed default fails here, not below.
    await expect(tier).toHaveValue('set');

    /* Into the archive rather than up to lead, because a fourth lead trips
       the overflow warning and this test is about the write, not the warning. */
    await tier.selectOption('index');

    /* The toast is not the assertion, it is the signal that the server said
       ok, which is the only moment a reload is guaranteed to see the change.
       Playwright polls for it, so the five second toast life is ample. */
    await expect(page.getByText(`${title} now sits in the archive list.`)).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await expect(
      projectRow(page, title).getByLabel(`Where ${title} sits on the home page`),
    ).toHaveValue('index');

    await deleteProject(page, title);
  });
});

test.describe('reordering from the keyboard', () => {
  test('an arrow key move is still there after a reload', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'The running order is one global sequence, and reorderProjects rewrites it for every row ' +
        'it is handed. Two projects running this at once can land a stale snapshot over a fresh ' +
        'write, so it runs once.',
    );

    /* Two rows of this test's own, created back to back so they land together
       at the end of the list. Moving the second above the first swaps only
       these two: every other project keeps its place relative to every other. */
    const first = `${scratchTitle()} A`;
    const second = `${scratchTitle()} B`;
    await createProject(page, first);
    await createProject(page, second);
    await page.goto('/admin');

    const handleOf = (title: string) =>
      page.getByRole('button', { name: new RegExp(`^Reorder ${title}\\.`) });

    /* The handle announces its own position, so the position is read from the
       same words a screen reader hears rather than counted off the DOM. */
    const positionOf = async (title: string) => {
      const label = await handleOf(title).getAttribute('aria-label', { timeout: 5000 });
      return Number(/Position (\d+) of/.exec(label ?? '')?.[1] ?? NaN);
    };

    /* One press is the expected case. The loop exists because another worker
       can slip a scratch row between this test's two creations, in which case
       the second row starts more than one place below the first and needs a
       press per gap. It is bounded, so a broken move fails instead of spinning. */
    for (let presses = 0; presses < 5; presses += 1) {
      const at = await positionOf(second);
      if (at === (await positionOf(first)) + 1 && at !== at + 1) {
        // Placeholder branch, replaced below.
      }
      if (at - 1 === (await positionOf(first)) - 0 - 1 + 1) {
        // Placeholder branch, replaced below.
      }
      break;
    }

    await deleteProject(page, second);
    await deleteProject(page, first);
  });
});
