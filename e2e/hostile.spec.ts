import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { en } from '../apps/web/src/i18n/en.ts';
import { HOURS } from './fixtures.ts';
import { confirmedHours, expectCleanPage, gotoView, loadSampleMonth, watch } from './helpers.ts';

/**
 * The hostile browser suite.
 *
 * WebKit does not run on the Linux runners, and what Safari refuses is not its
 * rendering: private browsing where IndexedDB and `localStorage` refuse to
 * write, in-app browsers where `window.open` is blocked, module workers
 * refused, `File.text()` missing in old WebKit. Every one of these refusals
 * has a fallback in the code, and every fallback has a jsdom test — but a
 * jsdom test proves the logic is written, not that it holds in a browser.
 *
 * So the failures are injected: `page.addInitScript` breaks the browser
 * *before* the page loads, on the engines we do have (Chromium, Firefox), and
 * the suite checks that the application holds — it starts, the month is on
 * screen with its figures, the refusal is announced, the fallback works.
 */

/** The dictionary the application speaks: no string is copied into a test. */
type MessageKey = keyof typeof en;

/** Fill the `{placeholders}` of a dictionary entry, the way the application does. */
function message(key: MessageKey, values: Readonly<Record<string, string | number>> = {}): string {
  const template: string = en[key];
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    template,
  );
}

/* ------------------------------------------------------------------ faults */

/** Safari in private mode: no IndexedDB, and `localStorage` refuses to write. */
function breakPrivateMode(): void {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  // The prototype, not the instance: Firefox ignores a property defined on
  // the `Storage` object itself.
  Object.defineProperty(Storage.prototype, 'setItem', {
    configurable: true,
    value: (): void => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  });
}

/** IndexedDB exists, but every open is refused, the way a blocked database does. */
function breakIndexedDb(): void {
  const scope = globalThis as unknown as { __ghostIndexedDbAttempts?: number };
  scope.__ghostIndexedDbAttempts = 0;
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: (): IDBOpenDBRequest => {
        scope.__ghostIndexedDbAttempts = (scope.__ghostIndexedDbAttempts ?? 0) + 1;
        const request = {} as IDBOpenDBRequest;
        Object.defineProperty(request, 'error', {
          get: () => new DOMException('The user denied permission to use IndexedDB.', 'SecurityError'),
        });
        // The refusal comes later: the caller attaches its handlers first.
        setTimeout(() => {
          const handler = request.onerror;
          if (handler) handler.call(request, new Event('error'));
        }, 0);
        return request;
      },
    },
  });
}

/** An in-app browser (LinkedIn, Teams, Instagram): `window.open` returns nothing. */
function breakWindowOpen(): void {
  Object.defineProperty(window, 'open', { configurable: true, writable: true, value: () => null });
}

/** No worker at all: the reconstruction must fall back to the main thread. */
function breakWorker(): void {
  Reflect.deleteProperty(globalThis, 'Worker');
}

/** A worker exists, but the browser refuses to build one (module workers). */
function refuseWorker(): void {
  const scope = globalThis as unknown as { __ghostWorkerAttempts?: number; Worker?: unknown };
  scope.__ghostWorkerAttempts = 0;
  scope.Worker = class RefusedWorker {
    constructor() {
      scope.__ghostWorkerAttempts = (scope.__ghostWorkerAttempts ?? 0) + 1;
      throw new Error('module workers are refused in this browser');
    }
  };
}

/** A worker that works, counted: the control of the hostile one. */
function countWorkerUses(): void {
  const scope = globalThis as unknown as { __ghostWorkerAttempts?: number; Worker?: unknown };
  scope.__ghostWorkerAttempts = 0;
  const real = scope.Worker;
  if (typeof real !== 'function') return;
  scope.Worker = new Proxy(real, {
    construct(target, args) {
      scope.__ghostWorkerAttempts = (scope.__ghostWorkerAttempts ?? 0) + 1;
      return Reflect.construct(target, args);
    },
  });
}

/** Old WebKit has no `File.text()`: a file must be read with `FileReader`. */
function breakFileText(): void {
  // Chromium exposes `text` on `Blob.prototype`, and `File` inherits it.
  Reflect.deleteProperty(Blob.prototype, 'text');
  Reflect.deleteProperty(File.prototype, 'text');
}

/* ----------------------------------------------------------------- helpers */

/** The counter of the month screen — the same one the smoke suite reads. */
function monthCounter(page: Page): Locator {
  return page.getByLabel(/Ghost hours counter/i);
}

/** Confirm the first day of the week grid: the gesture the smoke suite uses. */
async function confirmFirstDay(page: Page): Promise<void> {
  await gotoView(page, 'Week');
  const button = page.getByRole('button', { name: /Confirm the day/i }).first();
  await expect(button).toBeVisible();
  const before = await confirmedHours(page);
  await button.click();
  await expect
    .poll(async () => confirmedHours(page), { timeout: 15_000, message: 'confirmed hours did not move' })
    .toBeGreaterThan(before);
}

/** How many times the application tried to open the database. */
async function indexedDbAttempts(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scope = globalThis as unknown as { __ghostIndexedDbAttempts?: number };
    return scope.__ghostIndexedDbAttempts ?? 0;
  });
}

/** How many times the application tried to build a worker. */
async function workerAttempts(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scope = globalThis as unknown as { __ghostWorkerAttempts?: number };
    return scope.__ghostWorkerAttempts ?? 0;
  });
}

/** What the global scope holds where the worker should be. */
async function workerPresence(page: Page): Promise<string> {
  return page.evaluate(() => typeof (globalThis as unknown as { Worker?: unknown }).Worker);
}

/** What the prototype holds where `File.text()` should be. */
async function fileTextPresence(page: Page): Promise<string> {
  return page.evaluate(() => typeof (Blob.prototype as unknown as { text?: unknown }).text);
}

/* ----------------------------------------------------------------- fixtures */

interface EvidenceFile {
  readonly version: number;
  readonly collected_at: string;
  readonly generator: string;
  readonly timeZone: string;
  readonly repos: readonly unknown[];
  readonly items: readonly Record<string, unknown>[];
}

const here = fileURLToPath(new URL('.', import.meta.url));

/** The evidence file of the sample month, read from the fixture on disk. */
function sampleEvidenceFile(): EvidenceFile {
  const path = new URL('../fixtures/sample-month/evidence.json', `file://${here}`);
  return JSON.parse(readFileSync(path, 'utf8')) as EvidenceFile;
}

/** The proofs of the sample month, and the number of clones that cross the worker threshold. */
const PROOFS = sampleEvidenceFile().items.length;
const CLONES = 16;

/** The first `count` proofs of the sample month, as an uploadable file. */
function evidenceSubset(count: number): Buffer {
  const file = sampleEvidenceFile();
  return Buffer.from(JSON.stringify({ ...file, items: file.items.slice(0, count) }), 'utf8');
}

/** Move an instant by a few minutes, so the clones are not the same proofs. */
function shiftedInstants(item: Record<string, unknown>, minutes: number): Record<string, unknown> {
  const shifted: Record<string, unknown> = {};
  for (const key of ['at', 'start', 'end']) {
    const value = item[key];
    if (typeof value === 'string') shifted[key] = new Date(Date.parse(value) + minutes * 60_000).toISOString();
  }
  return shifted;
}

/** The same proofs repeated with distinct ids: more proofs than the worker threshold. */
function manyProofs(clones: number): Buffer {
  const file = sampleEvidenceFile();
  const items: Record<string, unknown>[] = [...file.items];
  for (let copy = 1; copy < clones; copy += 1) {
    for (const item of file.items) {
      items.push({ ...item, id: `${String(item.id)}-c${copy}`, ...shiftedInstants(item, copy) });
    }
  }
  return Buffer.from(JSON.stringify({ ...file, items }), 'utf8');
}

/** What the month shows after a big import, and whether a worker was tried. */
interface BigImport {
  readonly before: string;
  readonly after: string;
  readonly workerAttempts: number;
}

/**
 * Load the sample month, import more proofs than the worker threshold, and
 * read the month back. Above 2 000 proofs the reconstruction moves to a
 * worker: this is the only way to exercise that path in a real browser.
 */
async function monthAfterBigImport(browser: Browser, fault: (() => void) | undefined): Promise<BigImport> {
  const context = await browser.newContext({ locale: 'en-GB' });
  try {
    const page = await context.newPage();
    if (fault) await page.addInitScript(fault);
    await loadSampleMonth(page);
    const before = (await monthCounter(page).textContent()) ?? '';
    await gotoView(page, 'Settings');
    await page.locator('#import-evidence').setInputFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: manyProofs(CLONES),
    });
    await expect(page.getByText(message('settings.importedEvidence', { count: PROOFS * CLONES })).first()).toBeVisible();
    await expect.poll(async () => workerAttempts(page), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText(en['app.busy'])).toBeHidden({ timeout: 60_000 });
    await gotoView(page, 'Month');
    return {
      before,
      after: (await monthCounter(page).textContent()) ?? '',
      workerAttempts: await workerAttempts(page),
    };
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------- tests */

test('hostile 1 — private mode: the app starts, warns about the storage, and keeps working', async ({ page }) => {
  await page.addInitScript(breakPrivateMode);
  const seen = watch(page);
  await loadSampleMonth(page);

  // The app started: the month is on screen with its figures.
  await expect(monthCounter(page)).toContainText(HOURS.found);
  await expect(page.getByRole('heading', { name: en['app.title'], exact: true })).toBeVisible();

  // The refusal is announced where the reader is looking.
  await expect(page.getByRole('alert')).toContainText(en['error.persistence']);

  // The settings screen says the data will not survive the tab.
  await gotoView(page, 'Settings');
  await expect(page.getByText(en['settings.storageMemory'])).toBeVisible();

  // The state lives in memory: a gesture still moves the numbers.
  await confirmFirstDay(page);
  expectCleanPage(seen);
});

test('hostile 2 — IndexedDB present but blocked: the month loads, the fallback is silent', async ({ page }) => {
  await page.addInitScript(breakIndexedDb);
  const seen = watch(page);
  await loadSampleMonth(page);

  // The application really tried IndexedDB, and really was refused.
  expect(await indexedDbAttempts(page)).toBeGreaterThan(0);
  await expect(monthCounter(page)).toContainText(HOURS.found);

  // The data landed in the fallback store, and the screen says so.
  await gotoView(page, 'Settings');
  await expect(page.getByText(en['settings.storageLocal'])).toBeVisible();

  // The refusal was silent: nothing was thrown, nothing was logged.
  expectCleanPage(seen);
});

test('hostile 3 — a browser that blocks window.open: the draft is saved as a file', async ({ page }) => {
  await page.addInitScript(breakWindowOpen);
  await loadSampleMonth(page);
  await confirmFirstDay(page);
  await gotoView(page, 'Invoice');

  // The browser refuses to open a tab, as the in-app browsers do.
  expect(await page.evaluate(() => window.open('about:blank'))).toBeNull();

  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: /Print the draft/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  await expect(page.getByRole('status').filter({ hasText: en['invoice.printSaved'] })).toBeVisible();
});

test('hostile 4 — no worker: the month is rebuilt on the main thread, with the same figures', async ({
  page,
  browser,
}) => {
  // The global scope has no worker at all: the application must not need one.
  await page.addInitScript(breakWorker);
  await loadSampleMonth(page);
  await expect(monthCounter(page)).toContainText(HOURS.found);
  expect(await workerPresence(page)).toBe('undefined');

  // Above the worker threshold, a refused worker must not move the figures.
  const control = await monthAfterBigImport(browser, countWorkerUses);
  const hostile = await monthAfterBigImport(browser, refuseWorker);
  expect(control.workerAttempts).toBeGreaterThan(0);
  expect(hostile.workerAttempts).toBeGreaterThan(0);
  // The import really changed the month, and the refused worker changed nothing.
  expect(control.after).not.toBe(control.before);
  expect(hostile.after).not.toBe(hostile.before);
  expect(hostile.after).toBe(control.after);
});

test('hostile 5 — a browser without File.text(): the import goes through FileReader', async ({ page }) => {
  await page.addInitScript(breakFileText);
  await loadSampleMonth(page);
  await gotoView(page, 'Settings');

  // The prototype really lost the method the file import would have used.
  expect(await fileTextPresence(page)).toBe('undefined');

  const count = 12;
  await page.locator('#import-evidence').setInputFiles({
    name: 'evidence.json',
    mimeType: 'application/json',
    buffer: evidenceSubset(count),
  });
  await expect(page.getByText(message('settings.importedEvidence', { count })).first()).toBeVisible();
});
