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

export const HOURS = {
  found: `${Math.round(EXPECTED.foundMinutes / 60)} h`,
  declared: `${Math.round(EXPECTED.declaredMinutes / 60)} h`,
  ghost: `${Math.round(EXPECTED.ghostMinutes / 60)} h`,
};

/** 78000 cents in en-GB currency formatting: "€780.00". */
export const GHOST_AMOUNT = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
}).format(EXPECTED.ghostAmountCents / 100);
