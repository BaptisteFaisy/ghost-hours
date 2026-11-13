import type { Instant } from '@ghost-hours/core';
import { isEmptyInterval, makeInterval } from './interval.ts';
import type { Interval } from './interval.ts';
import { overlaps } from './overlaps.ts';
import { union } from './union.ts';

/** `a` minus `b`, as zero, one or two remaining pieces (never empty). */
export function difference(a: Interval, b: Interval): Interval[] {
  if (isEmptyInterval(a)) return [];
  if (!overlaps(a, b)) return [a];
  const pieces: Interval[] = [];
  if (b.start > a.start) pieces.push(makeInterval(a.start, Math.min(b.start, a.end)));
  if (b.end < a.end) pieces.push(makeInterval(Math.max(b.end, a.start), a.end));
  return pieces;
}

/**
 * `subject` minus every removal, in one sorted sweep over the merged removals.
 * The result never overlaps any removal and stays disjoint.
 */
export function subtractAll(subject: Interval, removals: readonly Interval[]): Interval[] {
  if (isEmptyInterval(subject)) return [];
  const pieces: Interval[] = [];
  let cursor = subject.start;
  for (const removal of union(removals)) {
    if (removal.end <= cursor) continue;
    if (removal.start >= subject.end) break;
    if (removal.start > cursor) pieces.push(makeInterval(cursor, removal.start));
    cursor = Math.max(cursor, removal.end);
    if (cursor >= subject.end) break;
  }
  if (cursor < subject.end) pieces.push(makeInterval(cursor, subject.end));
  return pieces;
}

/** Subtract a whole set from a whole set, each side normalised once. */
export function subtractSets(
  subjects: readonly Interval[],
  removals: readonly Interval[],
): Interval[] {
  const mergedRemovals = union(removals);
  return union(subjects).flatMap((subject) => subtractAll(subject, mergedRemovals));
}

/** Intersection of two sets, as a sorted disjoint set (two-pointer sweep). */
export function intersectSets(
  a: readonly Interval[],
  b: readonly Interval[],
): Interval[] {
  const left = union(a);
  const right = union(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const one = left[i];
    const other = right[j];
    if (one === undefined || other === undefined) break;
    const start = Math.max(one.start, other.start);
    const end = Math.min(one.end, other.end);
    if (end > start) result.push({ start, end });
    if (one.end <= other.end) i += 1;
    else j += 1;
  }
  return result;
}

/**
 * Cut an interval at the given instants. Points outside `(start, end)` are ignored,
 * duplicates collapse and the pieces keep the original total duration.
 */
export function splitAt(interval: Interval, points: readonly Instant[]): Interval[] {
  if (isEmptyInterval(interval)) return [];
  const cuts = [...new Set(points.filter((p) => p > interval.start && p < interval.end))].sort(
    (x, y) => x - y,
  );
  const bounds = [interval.start, ...cuts, interval.end];
  const pieces: Interval[] = [];
  for (let index = 1; index < bounds.length; index += 1) {
    const start = bounds[index - 1];
    const end = bounds[index];
    if (start === undefined || end === undefined || end <= start) continue;
    pieces.push(makeInterval(start, end));
  }
  return pieces;
}
