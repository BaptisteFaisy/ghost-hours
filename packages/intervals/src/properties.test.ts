import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  clampTo,
  coverageRatio,
  difference,
  durationMs,
  findOverlaps,
  gapsWithin,
  intersectSets,
  intersection,
  overlaps,
  splitAt,
  subtractAll,
  totalDurationMs,
  union,
} from './index.ts';
import type { Interval } from './index.ts';
import {
  MAX_INSTANT,
  intervalArb,
  intervalsArb,
  nonEmptyIntervalArb,
  nonEmptyIntervalsArb,
  shuffleWith,
} from './test-support.ts';

const RUNS = { numRuns: 200 } as const;

const sameSet = (a: readonly Interval[], b: readonly Interval[]): boolean =>
  JSON.stringify(union(a)) === JSON.stringify(union(b));

/** Reference equality skips the self-pair when `a` and `b` are the same array. */
const anyOverlap = (a: readonly Interval[], b: readonly Interval[]): boolean =>
  a.some((left) => b.some((right) => left !== right && overlaps(left, right)));

const containerArb = fc
  .tuple(fc.integer({ min: 0, max: MAX_INSTANT }), fc.integer({ min: 1, max: MAX_INSTANT }))
  .map(([start, length]) => ({ start, end: start + length }));

describe('HEU-P-01 basis: union() output never overlaps', () => {
  it('HEU-P-01 basis: union() output never overlaps', () => {
    fc.assert(
      fc.property(intervalsArb, (xs) => {
        const merged = union(xs);
        expect(findOverlaps(merged)).toEqual([]);
        expect(anyOverlap(merged, merged)).toBe(false);
      }),
      RUNS,
    );
  });
});

describe('HEU-P-02 basis: union duration', () => {
  it('HEU-P-02 basis: totalDurationMs(xs) === duration of union(xs)', () => {
    fc.assert(
      fc.property(intervalsArb, (xs) => {
        const summed = union(xs).reduce((total, interval) => total + durationMs(interval), 0);
        expect(totalDurationMs(xs)).toBe(summed);
        expect(totalDurationMs(xs)).toBeLessThanOrEqual(
          xs.reduce((total, interval) => total + durationMs(interval), 0),
        );
      }),
      RUNS,
    );
  });

  it('HEU-P-02 basis: covered time never exceeds the container', () => {
    fc.assert(
      fc.property(containerArb, intervalsArb, (container, xs) => {
        const covered = intersectSets([container], xs);
        expect(totalDurationMs(covered)).toBeLessThanOrEqual(durationMs(container));
        expect(coverageRatio(xs, container)).toBeLessThanOrEqual(1);
      }),
      RUNS,
    );
  });
});

describe('HEU-P-03 basis: order independence', () => {
  it('HEU-P-03 basis: order independence', () => {
    fc.assert(
      fc.property(intervalsArb, fc.integer({ min: 1, max: 100_000 }), (xs, seed) => {
        expect(union(shuffleWith(xs, seed))).toEqual(union(xs));
        expect(totalDurationMs(shuffleWith(xs, seed))).toBe(totalDurationMs(xs));
        expect(JSON.stringify(union(shuffleWith([...xs].reverse(), seed)))).toBe(
          JSON.stringify(union(xs)),
        );
      }),
      RUNS,
    );
  });
});

describe('HEU-P-04 basis: monotonicity', () => {
  it('HEU-P-04 basis: monotonicity', () => {
    fc.assert(
      fc.property(intervalsArb, intervalArb, containerArb, (xs, extra, container) => {
        const grown = [...xs, extra];
        expect(totalDurationMs(grown)).toBeGreaterThanOrEqual(totalDurationMs(xs));
        expect(coverageRatio(grown, container)).toBeGreaterThanOrEqual(
          coverageRatio(xs, container),
        );
      }),
      RUNS,
    );
  });
});

describe('union laws', () => {
  it('is idempotent, commutative and associative', () => {
    fc.assert(
      fc.property(intervalsArb, intervalsArb, intervalsArb, (a, b, c) => {
        expect(union(union(a))).toEqual(union(a));
        expect(sameSet(union([...a, ...b]), union([...b, ...a]))).toBe(true);
        expect(sameSet(union([...a, ...b, ...c]), union([...union(a), ...union(b), ...union(c)]))).toBe(
          true,
        );
      }),
      RUNS,
    );
  });

  it('returns a sorted, strictly disjoint set', () => {
    fc.assert(
      fc.property(intervalsArb, (xs) => {
        const merged = union(xs);
        for (let index = 1; index < merged.length; index += 1) {
          const previous = merged[index - 1];
          const current = merged[index];
          if (previous === undefined || current === undefined) continue;
          expect(previous.end).toBeLessThan(current.start);
        }
      }),
      RUNS,
    );
  });
});

describe('difference and subtraction', () => {
  it('difference(a, b) plus the intersection covers exactly a', () => {
    fc.assert(
      fc.property(intervalArb, intervalArb, (a, b) => {
        const rest = difference(a, b);
        const common = intersection(a, b);
        const rebuilt = common === null ? rest : [...rest, common];
        expect(sameSet(rebuilt, [a])).toBe(true);
        expect(totalDurationMs(rebuilt)).toBe(durationMs(a));
        expect(findOverlaps(rebuilt)).toEqual([]);
      }),
      RUNS,
    );
  });

  it('subtractAll never overlaps the removals and keeps the subject', () => {
    fc.assert(
      fc.property(intervalArb, intervalsArb, (subject, removals) => {
        const rest = subtractAll(subject, removals);
        expect(anyOverlap(rest, removals)).toBe(false);
        expect(findOverlaps(rest)).toEqual([]);
        expect(totalDurationMs(rest) + totalDurationMs(intersectSets([subject], removals))).toBe(
          durationMs(subject),
        );
      }),
      RUNS,
    );
  });
});

describe('splitAt and gaps', () => {
  it('splitAt conserves the total duration and the covered set', () => {
    fc.assert(
      fc.property(nonEmptyIntervalArb, fc.array(fc.integer({ min: -50, max: MAX_INSTANT })), (i, points) => {
        const pieces = splitAt(i, points);
        expect(totalDurationMs(pieces)).toBe(durationMs(i));
        expect(sameSet(pieces, [i])).toBe(true);
        expect(findOverlaps(pieces)).toEqual([]);
      }),
      RUNS,
    );
  });

  it('gapsWithin plus the clamped coverage rebuilds the container', () => {
    fc.assert(
      fc.property(containerArb, nonEmptyIntervalsArb, (container, covered) => {
        const gaps = gapsWithin(container, covered, 0);
        const inside = intersectSets([container], covered);
        expect(totalDurationMs(gaps) + totalDurationMs(inside)).toBe(durationMs(container));
        expect(anyOverlap(gaps, covered)).toBe(false);
        expect(coverageRatio(covered, container)).toBeGreaterThanOrEqual(0);
        expect(coverageRatio(covered, container)).toBeLessThanOrEqual(1);
      }),
      RUNS,
    );
  });

  it('coverageRatio stays within [0, 1] and is monotone in the container', () => {
    fc.assert(
      fc.property(containerArb, nonEmptyIntervalsArb, (container, covered) => {
        const ratio = coverageRatio(covered, container);
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
        expect(coverageRatio(covered, container)).toBe(ratio);
        const clamped = covered
          .map((interval) => clampTo(interval, container))
          .filter((interval): interval is Interval => interval !== null);
        expect(totalDurationMs(clamped) / durationMs(container)).toBeCloseTo(ratio, 10);
      }),
      RUNS,
    );
  });
});
