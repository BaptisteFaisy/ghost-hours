import { expect, test } from '@playwright/test';
import { EXPECTED, GHOST_AMOUNT, HOURS } from './fixtures.ts';
import { VIEWS, confirmedHours, expectCleanPage, gotoView, loadSampleMonth, watch } from './helpers.ts';

/**
 * Requirement 1 (HEU-F-30), 2 (HEU-N-01), 3 (D.7 P4→P7) and 4 of the
 * `e2e-smoke` spec. The desktop matrix: the built app, the public URL by
 * default, on every browser the project selects (see `playwright.config.ts`).
 */

test('requirement 1 — the sample month loads in one click and shows the announced figures', async ({ page }) => {
  await loadSampleMonth(page);
  const counter = page.getByLabel(/Ghost hours counter/i);
  await expect(counter).toContainText(HOURS.found);
  await expect(counter).toContainText(HOURS.declared);
  await expect(counter).toContainText(HOURS.ghost);
  await expect(counter).toContainText(GHOST_AMOUNT);
  await expect(counter).toContainText(`${EXPECTED.confirmedMinutes / 60} h`.replace('0 h', '0 h'));
});

test('requirement 2 — nothing leaves the browser and the console stays clean', async ({ page }) => {
  const seen = watch(page);
  await loadSampleMonth(page);
  for (const view of VIEWS) {
    await gotoView(page, view);
    await page.waitForTimeout(400);
  }
  expectCleanPage(seen);
});

test('requirement 3 — the reviewer path: week, confirmation, draft, export', async ({ page }) => {
  await loadSampleMonth(page);

  await gotoView(page, 'Week');
  await expect(page.getByRole('grid', { name: /Week grid/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm the day/i }).first()).toBeVisible();

  const confirmedBefore = await confirmedHours(page);
  await page.getByRole('button', { name: /Confirm the day/i }).first().click();
  await expect
    .poll(async () => confirmedHours(page), { timeout: 15_000, message: 'confirmed hours did not move' })
    .toBeGreaterThan(confirmedBefore);

  await gotoView(page, 'Invoice');
  const invoice = page.getByRole('region', { name: /Invoice draft/i });
  await expect(invoice).toContainText('Draft');
  const text = (await invoice.textContent()) ?? '';
  expect(text).not.toMatch(/\b[A-Z]{2,4}-\d{2,}/);
  expect(text).not.toMatch(/#[0-9]{2,}/);

  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: /Export the timesheet \(CSV\)/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('requirement 3b — the contradiction of the month is on screen', async ({ page }) => {
  await loadSampleMonth(page);
  await gotoView(page, 'Conflicts');
  // The screen is a region, and so is each contradiction inside it: take the
  // outer one by its class rather than by role, which would be ambiguous.
  const screen = page.locator('section.conflicts-screen');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText(/Share the minutes/i);
  await expect(screen.getByRole('button', { name: /Keep /i }).first()).toBeVisible();
  await expect(screen.getByRole('button', { name: /Share the minutes/i }).first()).toBeVisible();
});
