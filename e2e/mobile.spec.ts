import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The phone matrix (idea R-09). The link handed to the judges may well be
 * opened on a phone, in a browser nobody chose, in private mode. This suite
 * asks four questions a desktop run cannot: does the page boot at 390 px, does
 * the month load with its figures, does anything stick out of the screen, and
 * can a thumb reach every destination.
 *
 * It runs on Chromium mobile emulation everywhere and on Mobile Safari where a
 * host can run WebKit; the layout questions it asks are engine-independent.
 */

import { APP_URL } from './fixtures.ts';
import { VIEWS, expectCleanPage, gotoView, loadSampleMonth, watch } from './helpers.ts';

/** The document must not be wider than the screen: no sideways page. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(0, root.scrollWidth - window.innerWidth);
  });
}

/**
 * Every element that sticks out of the screen, widest last. Naming all of them
 * matters: a WebKit run costs minutes, and fixing one culprit per run would
 * cost one run per culprit.
 */
async function overflowCulprits(page: Page): Promise<string> {
  const found = await page.evaluate(() => {
    const limit = window.innerWidth;
    const out: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('body *')) {
      const box = node.getBoundingClientRect();
      if (box.right > limit + 1) {
        const label = node.getAttribute('aria-label') ?? node.className ?? node.tagName;
        out.push(`${node.tagName}.${String(label).slice(0, 50)} right=${Math.round(box.right)}`);
      }
    }
    return out;
  });
  return found.length === 0 ? 'none' : found.slice(-6).join(' ; ');
}

test('phone 1 — the page boots at 390 px without a blank screen', async ({ page }) => {
  const seen = watch(page);
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Load the sample month/i })).toBeVisible();
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, `body text was ${text.length} chars — a blank screen?`).toBeGreaterThan(40);
  expectCleanPage(seen);
});

test('phone 2 — the sample month loads and its figures are readable', async ({ page }) => {
  const seen = watch(page);
  await loadSampleMonth(page);
  const counter = page.getByLabel(/Ghost hours counter/i);
  await expect(counter).toBeVisible();
  // A figure the reader must scroll sideways to see is a figure they miss.
  const box = await counter.boundingBox();
  expect(box, 'the counter has no box').not.toBeNull();
  if (box !== null) {
    expect(box.width).toBeLessThanOrEqual((await page.viewportSize())?.width ?? 390);
  }
  await expect(counter).toContainText(/Ghost hours/);
  expectCleanPage(seen);
});

test('phone 3 — nothing sticks out of the screen on any view', async ({ page }) => {
  await loadSampleMonth(page);
  for (const view of ['Month', ...VIEWS]) {
    await gotoView(page, view);
    await page.waitForTimeout(350);
    const overflow = await horizontalOverflow(page);
    const culprit = overflow > 0 ? await overflowCulprits(page) : 'none';
    expect(overflow, `view ${view} overflows by ${overflow}px (${culprit})`).toBe(0);
  }
});

test('phone 4 — a thumb reaches every destination', async ({ page }) => {
  await loadSampleMonth(page);
  for (const view of VIEWS) {
    const nav = page.getByRole('navigation', { name: /Main navigation/i });
    const button = nav.getByRole('button', { name: new RegExp(`^${view}`, 'i') }).first();
    await button.scrollIntoViewIfNeeded();
    await expect(button, `${view} is not tappable`).toBeVisible();
    await button.tap();
    await page.waitForTimeout(250);
    const heading = await page.locator('main').innerText();
    expect(heading.length, `${view} rendered nothing`).toBeGreaterThan(20);
  }
});
