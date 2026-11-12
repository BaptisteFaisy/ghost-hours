import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP_URL, REAL } from './fixtures.ts';
import { expectCleanPage, gotoView, watch } from './helpers.ts';

/**
 * The real month (October 2026, anonymized): the same browser contract as the
 * fictitious one, on data nobody arranged. 977 proofs collected from three
 * repositories, 21 blocks, seven genuine contradictions — the figures come from
 * `fixtures/real-month/expected.json`, never from a literal copied here.
 */

async function loadRealMonth(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  const button = page.getByRole('button', { name: /real month/i });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(REAL.found).first()).toBeVisible({ timeout: 30_000 });
}

test('real 1 — a real month loads in one click and shows its own figures', async ({ page }) => {
  await loadRealMonth(page);
  const counter = page.getByLabel(/Ghost hours counter/i);
  await expect(counter).toContainText(REAL.found);
  // Nothing is declared in a real month: the gap is for the reader to fill in.
  await expect(counter).toContainText(/No declared hours yet|Declared hours/);
});

test('real 2 — the page says out loud that the month is real and anonymized', async ({ page }) => {
  await loadRealMonth(page);
  await expect(page.getByText(/anonymis|anonymiz/i).first()).toBeVisible();
});

test('real 3 — the contradictions of the real month are on screen', async ({ page }) => {
  await loadRealMonth(page);
  await gotoView(page, 'Conflicts');
  const screen = page.locator('section.conflicts-screen');
  await expect(screen).toBeVisible();
  // Seven in the fixture; the nav carries the count, so check it is not zero.
  const open = await screen.locator('section.conflict').count();
  expect(open, 'the real month has seven contradictions').toBeGreaterThanOrEqual(REAL.conflicts);
  await expect(screen.getByRole('button', { name: /Share the minutes/i }).first()).toBeVisible();
});

test('real 4 — real data leaves the browser nowhere either', async ({ page }) => {
  const seen = watch(page);
  await loadRealMonth(page);
  for (const view of ['Week', 'Evidence', 'Invoice', 'Clients', 'Settings']) {
    await gotoView(page, view);
    await page.waitForTimeout(300);
  }
  expectCleanPage(seen);
});
