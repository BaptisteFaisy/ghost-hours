import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP_URL, EXPECTED, GHOST_AMOUNT, HOURS, ORIGIN_UNDER_TEST } from './fixtures.ts';

/**
 * Requirement 1 (HEU-F-30), 2 (HEU-N-01), 3 (D.7 P4→P7) and 4 of the
 * `e2e-smoke` spec. One browser, the built app, the public URL by default.
 */

interface Watch {
  readonly foreign: string[];
  readonly consoleErrors: string[];
}

function watch(page: Page): Watch {
  const foreign: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN_UNDER_TEST && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      foreign.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  return { foreign, consoleErrors };
}

async function loadSampleMonth(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Load the sample month/i })).toBeVisible();
  await page.getByRole('button', { name: /Load the sample month/i }).click();
  await expect(page.getByText(HOURS.found).first()).toBeVisible({ timeout: 15_000 });
}

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
  for (const view of ['Week', 'Evidence', 'Invoice', 'Clients', 'Settings']) {
    await page.getByRole('button', { name: new RegExp(`^${view}$`, 'i') }).first().click();
    await page.waitForTimeout(400);
  }
  expect(seen.foreign, `requests to a foreign origin: ${seen.foreign.join(', ')}`).toEqual([]);
  expect(seen.consoleErrors, `console errors: ${seen.consoleErrors.join(' | ')}`).toEqual([]);
});

test('requirement 3 — the reviewer path: week, confirmation, draft, export', async ({ page }) => {
  await loadSampleMonth(page);

  await page.getByRole('button', { name: /^Week$/i }).first().click();
  await expect(page.getByRole('grid', { name: /Week grid/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm the day/i }).first()).toBeVisible();

  const confirmedBefore = await confirmedHours(page);
  await page.getByRole('button', { name: /Confirm the day/i }).first().click();
  await expect
    .poll(async () => confirmedHours(page), { timeout: 15_000, message: 'confirmed hours did not move' })
    .toBeGreaterThan(confirmedBefore);

  await page.getByRole('button', { name: /^Invoice$/i }).first().click();
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
  await page.getByRole('button', { name: /^Conflicts/i }).first().click();
  // The screen is a region, and so is each contradiction inside it: take the
  // outer one by its class rather than by role, which would be ambiguous.
  const screen = page.locator('section.conflicts-screen');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText(/Share the minutes/i);
  await expect(screen.getByRole('button', { name: /Keep /i }).first()).toBeVisible();
  await expect(screen.getByRole('button', { name: /Share the minutes/i }).first()).toBeVisible();
});

/** Hours shown by the "Confirmed hours" counter of the month screen. */
async function confirmedHours(page: Page): Promise<number> {
  await page.getByRole('button', { name: /^Month$/i }).first().click();
  await page.waitForTimeout(300);
  const counter = page.getByLabel(/Ghost hours counter/i);
  const text = (await counter.textContent()) ?? '';
  const match = /Confirmed hours\s*([\d.,]+)\s*h/.exec(text.replace(/\s+/g, ' '));
  await page.getByRole('button', { name: /^Week$/i }).first().click();
  const value = match?.[1] ?? '0';
  return Number.parseFloat(value.replace(',', '.'));
}
