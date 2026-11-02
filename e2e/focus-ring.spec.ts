/**
 * §6 hover and focus-visible, driven by a real keyboard and a real
 * pointer — the half of §10 that cannot be read off the source.
 *
 * R-M9 wired thirteen components and could verify one. The other twelve
 * are behind a signed-in session, so the claim "keyboard tabbing on web
 * shows the focus ring on every interactive row, card and button" sat
 * unproven through two milestones. `src/gallery` renders the six that
 * are importable with fixed props; this walks them.
 *
 * ## What it is actually guarding
 *
 * Three things, each of which was wrong when this was written:
 *
 *  1. **The ring exists in the DOM** on every stop. An unwired
 *     component shows nothing, which is how `AddPill` was found: the
 *     Discover row stopped twice and the second stop was bare.
 *  2. **The ring is outside a filled control**, not inside it. The
 *     ring is `border/accent` and so is the primary fill, so an inset
 *     ring on a primary button is forest on forest. It passed a DOM
 *     check and was invisible on screen; only the geometry says which
 *     one you have.
 *  3. **A mouse click shows no ring.** `focused` is true for a click
 *     too — "focus-visible" is the whole point of
 *     `platform/focusVisible`, and a regression there would put a ring
 *     on every tapped row.
 *
 * The one stop with no ring is `Input`, which reserves a 3px halo in
 * its padding at all times instead (see `tokens.input.focusRingWidth`).
 * It is asserted as zero rather than skipped, so a `FocusRing` quietly
 * appearing there would fail.
 */

import { expect, test } from '@playwright/test';

/** Tab stops, in DOM order, with the number of rings each should show. */
const STOPS: { stop: string; rings: number; note?: string }[] = [
  { stop: 'stop-button-primary', rings: 1 },
  { stop: 'stop-button-secondary', rings: 1 },
  { stop: 'stop-button-tertiary', rings: 1 },
  { stop: 'stop-input', rings: 0, note: 'reserves its own halo in padding' },
  { stop: 'stop-list-row', rings: 1 },
  { stop: 'stop-list-row-toggle', rings: 1 },
  { stop: 'stop-recent-listen-row', rings: 1 },
  { stop: 'stop-discover-book-row', rings: 1 },
  // The Add pill inside the row. Its own stop, which is why it was
  // missed: the row around it was wired and it was not.
  { stop: 'stop-discover-book-row', rings: 1 },
  { stop: 'stop-rail-card', rings: 1 },
  { stop: 'stop-book-grid-tile', rings: 1 },
];

/** Where the focus landed and whether its stop is showing a ring. */
const PROBE = `(() => {
  const a = document.activeElement;
  const s = a && a.closest ? a.closest('[data-testid^="stop-"]') : null;
  return {
    stop: s ? s.getAttribute('data-testid') : null,
    rings: s ? s.querySelectorAll('[data-testid="focus-ring"]').length : 0,
    label: (a && a.textContent || '').slice(0, 24),
  };
})()`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?gallery=1');
  await expect(page.getByTestId('ui-gallery')).toBeVisible({ timeout: 30_000 });
});

test('tabbing shows exactly one focus ring per stop', async ({ page }) => {
  const walk: { stop: string | null; rings: number; label: string }[] = [];
  for (let i = 0; i < STOPS.length; i++) {
    await page.keyboard.press('Tab');
    walk.push(await page.evaluate(PROBE));
  }

  expect(
    walk.map((w) => `${w.stop}:${w.rings}`),
    `tab walk was:\n${walk.map((w) => `  ${w.stop} rings=${w.rings} "${w.label}"`).join('\n')}`,
  ).toEqual(STOPS.map((s) => `${s.stop}:${s.rings}`));
});

test('the ring on a filled button is outside it, not inside', async ({
  page,
}) => {
  await page.keyboard.press('Tab');

  const box = await page.evaluate(`(() => {
    const stop = document.querySelector('[data-testid="stop-button-primary"]');
    const ring = stop.querySelector('[data-testid="focus-ring"]');
    const btn = stop.querySelector('button, [tabindex="0"]');
    if (!ring || !btn) return null;
    const r = ring.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    return {
      top: Math.round(b.top - r.top),
      left: Math.round(b.left - r.left),
      right: Math.round(r.right - b.right),
      bottom: Math.round(r.bottom - b.bottom),
    };
  })()`);

  // `Button / Variant=Primary, Size=Large, State=Focus-visible`
  // (298:696) draws its ring at -4,-4 around the button: 128 x 60
  // around 120 x 52. `tokens.focusRing.card.outset` is that 4.
  expect(box, 'no ring or no button found on the first tab stop').not.toBeNull();
  expect(box).toEqual({ top: 4, left: 4, right: 4, bottom: 4 });
});

test('a mouse click focuses without showing a ring', async ({ page }) => {
  const row = page.getByTestId('stop-list-row');

  // Hover first: §6's row rule is a `bg/surface` tint, and the resting
  // row has no background at all.
  const resting = await rowBackground(page);
  await row.hover();
  const hovered = await rowBackground(page);
  expect(resting, 'the row should rest with no fill').toBe('rgba(0, 0, 0, 0)');
  expect(hovered, 'hover should tint the row').not.toBe(resting);

  await row.click();
  expect(
    await page.evaluate(`(() => {
      const a = document.activeElement;
      return {
        inRow: !!(a && a.closest && a.closest('[data-testid="stop-list-row"]')),
        rings: document.querySelectorAll('[data-testid="focus-ring"]').length,
      };
    })()`),
    'a click should focus the row and show no ring',
  ).toEqual({ inRow: true, rings: 0 });

  // And the keyboard puts it back, which is the half that proves the
  // modality is tracked rather than latched off by the first click.
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid="focus-ring"]')).toHaveCount(1);
});

function rowBackground(page: import('@playwright/test').Page) {
  return page.evaluate(`(() => {
    const s = document.querySelector('[data-testid="stop-list-row"]');
    const el = s.querySelector('[tabindex="0"], button') || s.firstElementChild;
    return getComputedStyle(el).backgroundColor;
  })()`) as Promise<string>;
}
