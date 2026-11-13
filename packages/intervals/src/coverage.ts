import { clampTo, durationMs, isEmptyInterval } from './interval.ts';
import type { Interval } from './interval.ts';
import { subtractAll } from './set-ops.ts';
import { union } from './union.ts';

/**
 * Uncovered stretches inside `container`, in order, keeping only those at least
 * `minGapMs` long. `covered` pieces outside the container are ignored, so the
 * gaps plus the clamped coverage rebuild the container exactly.
 */
export function gapsWithin(
  container: Interval,
  covered: readonly Interval[],
  minGapMs: number,
): Interval[] {
  if (isEmptyInterval(container)) return [];
  const threshold = Number.isFinite(minGapMs) ? Math.max(0, minGapMs) : 0;
  return subtractAll(container, covered).filter((gap) => durationMs(gap) >= threshold);
}

/**
 * Share of `container` covered by `covered`, between 0 and 1.
 * Returns 0 for an empty container rather than dividing by zero.
 */
export function coverageRatio(covered: readonly Interval[], container: Interval): number {
  const total = durationMs(container);
  if (total <= 0) return 0;
  const inner = union(covered).reduce((sum, interval) => {
    const clamped = clampTo(interval, container);
    return clamped === null ? sum : sum + durationMs(clamped);
  }, 0);
  return Math.min(1, Math.max(0, inner / total));
}
