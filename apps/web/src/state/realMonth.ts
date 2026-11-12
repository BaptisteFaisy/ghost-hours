import type { RealMonth } from '@ghost-hours/fixture-real-month';

/**
 * The door to the real month (October 2026, anonymized).
 *
 * The fixture is a 219 KB JSON file: it must never weigh on the first paint,
 * so the package is imported lazily — only when the reader clicks the button.
 * Vite splits it into its own chunk; this module is the single place that
 * knows the import is deferred. The type import above is erased at compile
 * time and pulls nothing into the bundle.
 */

/** Load the real month on demand (dynamic import: the JSON stays out of the initial bundle). */
export async function fetchRealMonth(): Promise<RealMonth> {
  const { loadRealMonth } = await import('@ghost-hours/fixture-real-month');
  return loadRealMonth();
}

export type { RealMonth };
