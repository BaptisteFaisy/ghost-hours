import { durationMs, nonEmptyIntervals, sortByStart } from './interval.ts';
import type { Interval } from './interval.ts';

/**
 * Sorted, disjoint, maximal union of the inputs.
 * Intervals that merely touch (`[1,2)` and `[2,3)`) are merged into one.
 * Empty intervals are dropped: the result never contains an empty interval.
 */
export function union(intervals: readonly Interval[]): Interval[] {
  const sorted = sortByStart(nonEmptyIntervals(intervals));
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && current.start <= last.end) {
      if (current.end > last.end) merged[merged.length - 1] = { start: last.start, end: current.end };
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/** Documented alias of {@link union}: a normalised set is exactly its union. */
export const normalizeIntervals = union;

/** Total covered time, i.e. the duration of the union — not the sum of durations. */
export function totalDurationMs(intervals: readonly Interval[]): number {
  return union(intervals).reduce((total, interval) => total + durationMs(interval), 0);
}
