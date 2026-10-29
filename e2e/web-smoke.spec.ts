/**
 * Web smoke test — the guard architecture M4a exists to install.
 *
 * `expo export --platform web` exiting 0 means nothing on its own. M0
 * spike 2 hit the failure this test is here for: a valid bundle, a
 * green build, and a blank page, because Expo serves the bundle as a
 * classic `<script>` and one `import.meta` anywhere in the graph is a
 * syntax error outside a module. The whole bundle dies before a line
 * of app code runs, and a build-only check never notices.
 *
 * So this **loads the page** and asserts the app painted. It is the
 * cheapest thing that would have caught that class, and `ci.yml` has
 * carried a comment asking for it since the spike.
 *
 * **390 and 1440.** 1440 is the case anyone would try by hand; 390 web
 * has never been looked at by anyone, which makes it the one more
 * likely to be broken.
 */

import { expect, test } from '@playwright/test';

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const { name, width, height } of WIDTHS) {
  test(`welcome renders at ${width} (${name})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width, height });
    await page.goto('/');

    // The headline, not the title tag: a dead bundle still serves an
    // <html> with the right <title>, so only painted content proves
    // the app booted.
    await expect(
      page.getByText('Everything you need to', { exact: false }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Get started', { exact: false })).toBeVisible();

    expect(errors, `console errors at ${width}px:\n${errors.join('\n')}`).toEqual(
      [],
    );
  });
}
