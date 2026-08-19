import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/architecture/', '/resume/', '/contact/'];

test.describe('the public site', () => {
  for (const route of ROUTES) {
    test(`${route} renders with exactly one h1`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }

  test('the home page shows the projects', async ({ page }) => {
    await page.goto('/');
    /* Three leads, which is the rule the whole tier system exists to hold. */
    await expect(page.locator('.card-lead')).toHaveCount(3);
    await expect(page.locator('.rail .card').first()).toBeVisible();
  });

  test('a project page carries its own content', async ({ page }) => {
    await page.goto('/work/lincoln-beach-center/');
    await expect(page.locator('h1')).toHaveText('Lincoln Beach Center');
    /* The body is markdown. Rendering it as plain text published the source
       once, so this asserts the markup exists rather than just the words. */
    await expect(page.locator('.prose p').first()).toBeVisible();
    await expect(page.locator('.stagger figure img').first()).toBeVisible();
  });

  test('the walkthrough film is visible, not stuck at opacity zero', async ({ page }) => {
    await page.goto('/work/lincoln-beach-center/');
    const film = page.locator('.film-frame');
    await film.scrollIntoViewIfNeeded();
    /* It reveals on scroll by adding is-in. Without that class the stylesheet
       leaves it at opacity 0 permanently, which is exactly what shipped once. */
    await expect(film).toHaveClass(/is-in/);
    await expect(film.locator('video')).toBeVisible();
  });

  test('a missing project is a 404, not a crash', async ({ page }) => {
    const response = await page.goto('/work/not-a-real-project/');
    expect(response?.status()).toBe(404);
  });

  test('the theme switch flips and persists', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-theme-toggle]');

    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    /* The visible text is the accessible name. An aria-label was added here
       once and broke the WCAG label in name match. */
    await expect(toggle).toHaveAccessibleName(/dark/i);

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a project expands in place without leaving the page', async ({ page }) => {
    await page.goto('/architecture/');
    const tile = page.locator('[data-expand]').first();
    const slug = await tile.getAttribute('data-expand');

    await tile.click();
    await expect(page.locator(`[data-panel="${slug}"]`)).toBeVisible();
    expect(page.url()).toContain('/architecture');

    /* Escape closes and hands focus back, which is the part a keyboard visitor
       depends on and the part most likely to be dropped. */
    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-panel="${slug}"]`)).toBeHidden();
    await expect(tile).toBeFocused();
  });

  test('a deep link opens the project it names', async ({ page }) => {
    await page.goto('/architecture/#panel-lincoln-beach-center');
    await expect(page.locator('[data-panel="lincoln-beach-center"]')).toBeVisible();
  });

  test('the skip link is the first thing a keyboard reaches', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip')).toBeFocused();
  });

  test('every image on a project page has alt text', async ({ page }) => {
    await page.goto('/work/lincoln-beach-center/');
    const images = page.locator('.stagger img, .sheets img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt?.trim(), `image ${i} has no alt text`).toBeTruthy();
    }
  });
});

test.describe('the administration area', () => {
  test('is not reachable without an identity', async ({ page }) => {
    /* ACCESS_DEV_BYPASS is on locally, so this asserts the shape of the guard
       rather than the guard itself: /admin either opens for a signed in
       developer or redirects. What must never happen is a 200 with the editor
       on it for someone with no identity, which is what the deployed Access
       policy prevents.

       Skipped where the bypass is on, and the reason is written here rather
       than left as a silent pass. */
    test.skip(
      process.env.ACCESS_DEV_BYPASS === 'true',
      'ACCESS_DEV_BYPASS is on, so /admin is deliberately open locally',
    );

    const response = await page.goto('/admin');
    expect(response?.status()).not.toBe(200);
  });
});

/**
 * The hero picks one of two encodes at runtime, on layout width in CSS pixels.
 *
 * This has its own test because the rule was got wrong once in a way nothing
 * would have caught: multiplying the width by devicePixelRatio pushed a phone
 * held sideways past the threshold, so a handset on cellular downloaded the
 * 42.8MB file instead of the 8MB one. Nothing breaks visibly when that happens,
 * which is why it needs asserting rather than looking at.
 */
test.describe('the hero film chooses its encode by width', () => {
  test('a wide viewport gets the large encode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const video = page.locator('[data-hero]');
    await expect(video).toHaveAttribute('src', /hero-1440/);
  });

  test('a narrow viewport gets the small one', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    const video = page.locator('[data-hero]');
    await expect(video).toHaveAttribute('src', /hero-720/);
  });

  test('the markup names both encodes even before the script runs', async ({ page }) => {
    await page.goto('/');
    const video = page.locator('[data-hero]');

    /* The served HTML has to declare what exists. Without these attributes a
       visitor with no JavaScript sees a video element with no source at all. */
    await expect(video).toHaveAttribute('data-src-large', /hero-1440/);
    await expect(video).toHaveAttribute('data-src-small', /hero-720/);
  });
});
