import * as fc from 'fast-check';
import { makeInterval } from './interval.ts';
import type { Interval } from './interval.ts';

/** Upper bound of the generated instants: keeps arithmetic exact and readable. */
export const MAX_INSTANT = 10_000;

export const instantArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: MAX_INSTANT });

/** Any interval, empty ones included, built through `makeInterval`. */
export const intervalArb: fc.Arbitrary<Interval> = fc
  .tuple(instantArb, instantArb)
  .map(([a, b]) => makeInterval(Math.min(a, b), Math.max(a, b)));

/** Non-empty interval, the interesting case for algebraic laws. */
export const nonEmptyIntervalArb: fc.Arbitrary<Interval> = fc
  .tuple(instantArb, fc.integer({ min: 1, max: 1_000 }))
  .map(([start, length]) => makeInterval(start, start + length));

export const intervalsArb: fc.Arbitrary<Interval[]> = fc.array(intervalArb, { maxLength: 20 });

export const nonEmptyIntervalsArb: fc.Arbitrary<Interval[]> = fc.array(nonEmptyIntervalArb, {
  maxLength: 20,
});

/** Deterministic Fisher-Yates shuffle driven by a 32-bit LCG (no Math.random). */
export function shuffleWith<T>(values: readonly T[], seed: number): T[] {
  const copy = [...values];
  let state = (seed >>> 0) || 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swap = state % (index + 1);
    const left = copy[index];
    const right = copy[swap];
    if (left === undefined || right === undefined) continue;
    copy[index] = right;
    copy[swap] = left;
  }
  return copy;
}

/** Deterministic pseudo-random interval generator used by the performance test. */
export function seededIntervals(count: number, seed: number): Interval[] {
  let state = (seed >>> 0) || 1;
  const next = (bound: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % bound;
  };
  const result: Interval[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = next(1_000_000);
    result.push(makeInterval(start, start + 1 + next(600)));
  }
  return result;
}
