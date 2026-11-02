/**
 * The web alert dialog — the thing `Alert.alert` was not doing.
 *
 * `react-native-web` ships `class Alert { static alert() {} }`, so for
 * as long as the app called RN's `Alert` directly, 30 confirmations and
 * error messages across seven files drew nothing at all on web. Nothing
 * threw, nothing logged, and no gate noticed, because an empty function
 * is a perfectly good empty function.
 *
 * That is the failure this guards: **a dialog that does not appear**.
 * The assertions are therefore about the dialog being on screen and
 * going away again, not about how it looks.
 *
 * It drives the gallery's two specimens rather than a real call site,
 * because all 30 of those sit behind a signed-in session.
 */

import { expect, test } from '@playwright/test';

const dialog = '[role="dialog"]';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?gallery=1');
  await expect(page.getByTestId('ui-gallery')).toBeVisible({ timeout: 30_000 });
});

test('a one-button alert opens and closes', async ({ page }) => {
  await expect(page.locator(dialog)).toHaveCount(0);

  await page.getByRole('button', { name: 'Raise a one-button alert' }).click();

  const open = page.locator(dialog);
  await expect(open).toBeVisible();
  await expect(open).toContainText('Could not add book');
  await expect(open).toContainText('We could not reach the server');

  // A caller that passes no buttons gets RN's lone OK, supplied by the
  // web adapter rather than by 30 call sites.
  await open.getByRole('button', { name: 'OK' }).click();
  await expect(page.locator(dialog)).toHaveCount(0);
});

test('cancel and destructive actions both answer, and alerts queue', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Raise two alerts' }).click();

  const first = page.locator(dialog);
  await expect(first).toContainText('Remove this book?');
  await expect(first.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Remove' })).toBeVisible();

  // Dismissing the first must reveal the second rather than drop it:
  // two failures in one handler are two things the user has to read.
  await first.getByRole('button', { name: 'Cancel' }).click();

  const second = page.locator(dialog);
  await expect(second).toContainText('And one behind it');
  await second.getByRole('button', { name: 'OK' }).click();
  await expect(page.locator(dialog)).toHaveCount(0);
});
