import { isEmptyInterval, sortByStart } from './interval.ts';
import type { Interval } from './interval.ts';

/** True when the two intervals share at least one instant. Touching is not overlapping. */
export function overlaps(a: Interval, b: Interval): boolean {
  if (isEmptyInterval(a) || isEmptyInterval(b)) return false;
  return a.start < b.end && b.start < a.end;
}

/** True when the intervals are adjacent (`a.end === b.start` or the reverse). */
export function touches(a: Interval, b: Interval): boolean {
  if (isEmptyInterval(a) || isEmptyInterval(b)) return false;
  return a.end === b.start || b.end === a.start;
}

/** True when the intervals overlap or touch — the test used to merge blocks. */
export function intersects(a: Interval, b: Interval): boolean {
  return overlaps(a, b) || touches(a, b);
}

/** Common part of two intervals; `null` when it is empty. */
export function intersection(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/**
 * Connected groups of mutually overlapping intervals (transitive closure).
 * Singleton intervals are not reported, so a disjoint set yields `[]`.
 * Groups and their members are ordered by start then end: deterministic output.
 */
export function findOverlaps(intervals: readonly Interval[]): Interval[][] {
  const groups: Interval[][] = [];
  let current: Interval[] = [];
  let currentEnd = Number.NEGATIVE_INFINITY;
  for (const interval of sortByStart(intervals.filter((i) => !isEmptyInterval(i)))) {
    if (current.length > 0 && interval.start < currentEnd) {
      current.push(interval);
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      if (current.length > 1) groups.push(current);
      current = [interval];
      currentEnd = interval.end;
    }
  }
  if (current.length > 1) groups.push(current);
  return groups;
}
