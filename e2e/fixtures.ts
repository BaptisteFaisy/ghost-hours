import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The figures the smoke test asserts come from the fixture itself, never from
 * literals copied into the test: if the product changes, one file changes.
 */

interface ExpectedClient {
  readonly foundMinutes: number;
  readonly declaredMinutes: number;
  readonly ghostMinutes: number;
  readonly ghostAmountCents: number;
}

export interface Expected {
  readonly period: { readonly year: number; readonly month: number };
  readonly timeZone: string;
  readonly foundMinutes: number;
  readonly confirmedMinutes: number;
  readonly declaredMinutes: number;
  readonly ghostMinutes: number;
  readonly ghostAmountCents: number;
  readonly perClient: Readonly<Record<string, ExpectedClient>>;
  readonly blockCount: number;
  readonly conflictCount: number;
  readonly unprovenBlocks: number;
}

const here = fileURLToPath(new URL('.', import.meta.url));

export const EXPECTED: Expected = JSON.parse(
  readFileSync(new URL('../fixtures/sample-month/expected.json', `file://${here}`), 'utf8'),
) as Expected;

const TARGET = process.env.GHOST_HOURS_URL ?? 'http://localhost:4173/ghost-hours/';

/** The page under test, and the only origin it may talk to. */
export const APP_URL = TARGET.endsWith('/') ? TARGET : `${TARGET}/`;
export const ORIGIN_UNDER_TEST = new URL(APP_URL).origin;

/** `2052` → `34.2 h`, and `6240` → `104 h`: what the month counter prints. */
function hours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} h`.replace(/\.0(\s)/, '$1');
}

export const HOURS = {
  found: hours(EXPECTED.foundMinutes),
  declared: hours(EXPECTED.declaredMinutes),
  ghost: hours(EXPECTED.ghostMinutes),
};

/**
 * The real month of `fixtures/real-month`: the same rule as for the sample —
 * the figures the suite asserts come from the fixture, never from a literal.
 */
export const REAL_EXPECTED = JSON.parse(
  readFileSync(new URL('../fixtures/real-month/expected.json', `file://${here}`), 'utf8'),
) as {
  readonly foundMinutes: number;
  readonly blockCount: number;
  readonly conflictCount: number;
  readonly evidenceCount: number;
  readonly activeDays: number;
};

export const REAL = {
  found: hours(REAL_EXPECTED.foundMinutes),
  blocks: REAL_EXPECTED.blockCount,
  conflicts: REAL_EXPECTED.conflictCount,
  evidence: REAL_EXPECTED.evidenceCount,
  days: REAL_EXPECTED.activeDays,
};

/** 78000 cents in en-GB currency formatting: "€780.00". */
export const GHOST_AMOUNT = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
}).format(EXPECTED.ghostAmountCents / 100);
