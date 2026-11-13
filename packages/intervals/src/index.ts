/**
 * `@ghost-hours/intervals` — pure interval algebra over half-open `[start, end)`
 * epoch-millisecond intervals. Deterministic, allocation-light, O(n log n) sweeps.
 */
export type { Interval } from './interval.ts';
export {
  clampTo,
  compareByStart,
  durationMs,
  isEmptyInterval,
  isValidInterval,
  makeInterval,
  nonEmptyIntervals,
  sortByStart,
} from './interval.ts';
export { normalizeIntervals, totalDurationMs, union } from './union.ts';
export { findOverlaps, intersects, intersection, overlaps, touches } from './overlaps.ts';
export {
  difference,
  intersectSets,
  splitAt,
  subtractAll,
  subtractSets,
} from './set-ops.ts';
export { coverageRatio, gapsWithin } from './coverage.ts';
