import type { Instant } from '@ghost-hours/core';

/**
 * A half-open time interval `[start, end)`, expressed in epoch milliseconds.
 * `start === end` is a legal but empty interval: it covers no instant at all.
 */
export interface Interval {
  readonly start: Instant;
  readonly end: Instant;
}

/**
 * Build an interval, rejecting inverted bounds.
 * @throws RangeError when `end < start`.
 */
export function makeInterval(start: Instant, end: Instant): Interval {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError('Interval bounds must be finite instants');
  }
  if (end < start) {
    throw new RangeError(`Interval end (${end}) is before its start (${start})`);
  }
  return { start, end };
}

/** True when the bounds are finite and correctly ordered. */
export function isValidInterval(interval: Interval): boolean {
  return (
    Number.isFinite(interval.start) &&
    Number.isFinite(interval.end) &&
    interval.end >= interval.start
  );
}

/** True when the interval covers no instant (`start >= end`). */
export function isEmptyInterval(interval: Interval): boolean {
  return interval.end <= interval.start;
}

/** Length of the interval in milliseconds; never negative. */
export function durationMs(interval: Interval): number {
  return Math.max(0, interval.end - interval.start);
}

/** Deterministic ordering: start first, then end (total order on intervals). */
export function compareByStart(a: Interval, b: Interval): number {
  return a.start - b.start || a.end - b.end;
}

/** Non-mutating copy sorted by {@link compareByStart}. */
export function sortByStart(intervals: readonly Interval[]): Interval[] {
  return [...intervals].sort(compareByStart);
}

/** Copy without the empty intervals — they cover nothing and carry no signal. */
export function nonEmptyIntervals(intervals: readonly Interval[]): Interval[] {
  return intervals.filter((interval) => !isEmptyInterval(interval));
}

/**
 * Restrict an interval to `bounds`; `null` when the restriction is empty.
 * A clamp never extends the input: the result is a subset of both arguments.
 */
export function clampTo(interval: Interval, bounds: Interval): Interval | null {
  const start = Math.max(interval.start, bounds.start);
  const end = Math.min(interval.end, bounds.end);
  return end > start ? { start, end } : null;
}
