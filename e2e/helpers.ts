import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP_URL, HOURS, ORIGIN_UNDER_TEST } from './fixtures.ts';

/**
 * Gestures shared by the desktop suite (`smoke.spec.ts`) and the phone suite
 * (`mobile.spec.ts`): one implementation, two matrices.
 */

export interface Watch {
  readonly foreign: string[];
  readonly consoleErrors: string[];
}

/** Record every request to a foreign origin and every console error. */
export function watch(page: Page): Watch {
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

/** Assert a watched page stayed silent: no network, no error. */
export function expectCleanPage(seen: Watch): void {
  expect(seen.foreign, `requests to a foreign origin: ${seen.foreign.join(', ')}`).toEqual([]);
  expect(seen.consoleErrors, `console errors: ${seen.consoleErrors.join(' | ')}`).toEqual([]);
}

/** Open the page and load the sample month with the one documented click. */
export async function loadSampleMonth(page: Page): Promise<void> {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Load the sample month/i })).toBeVisible();
  await page.getByRole('button', { name: /Load the sample month/i }).click();
  await expect(page.getByText(HOURS.found).first()).toBeVisible({ timeout: 15_000 });
}

/** The six destinations of the navigation, in the order the tabs show them. */
export const VIEWS = ['Week', 'Evidence', 'Invoice', 'Clients', 'Settings'] as const;

/**
 * Move to a screen through the main navigation. The match is a prefix on
 * purpose: the Conflicts tab carries a counter, so its accessible name is
 * "Conflicts (2)" and an exact match would wait for a button that never comes.
 */
export async function gotoView(page: Page, label: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: /Main navigation/i });
  await nav.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first().click();
}

/** Hours shown by the "Confirmed hours" counter of the month screen. */
export async function confirmedHours(page: Page): Promise<number> {
  await gotoView(page, 'Month');
  await page.waitForTimeout(300);
  const counter = page.getByLabel(/Ghost hours counter/i);
  const text = (await counter.textContent()) ?? '';
  const match = /Confirmed hours\s*([\d.,]+)\s*h/.exec(text.replace(/\s+/g, ' '));
  await gotoView(page, 'Week');
  const value = match?.[1] ?? '0';
  return Number.parseFloat(value.replace(',', '.'));
}
