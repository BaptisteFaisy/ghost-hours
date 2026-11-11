import { describe, expect, it } from 'vitest';
import {
  clampTo,
  coverageRatio,
  difference,
  durationMs,
  findOverlaps,
  gapsWithin,
  intersectSets,
  intersection,
  intersects,
  isEmptyInterval,
  isValidInterval,
  makeInterval,
  normalizeIntervals,
  overlaps,
  sortByStart,
  splitAt,
  subtractAll,
  subtractSets,
  totalDurationMs,
  touches,
  union,
} from './index.ts';
import type { Interval } from './index.ts';

const at = (start: number, end: number): Interval => makeInterval(start, end);

describe('interval basics', () => {
  it('builds intervals and rejects inverted bounds', () => {
    expect(at(1, 5)).toEqual({ start: 1, end: 5 });
    expect(at(3, 3)).toEqual({ start: 3, end: 3 });
    expect(() => makeInterval(5, 1)).toThrow(RangeError);
    expect(() => makeInterval(Number.NaN, 1)).toThrow(RangeError);
  });

  it('validates and measures intervals', () => {
    expect(isValidInterval(at(0, 10))).toBe(true);
    expect(isValidInterval({ start: 10, end: 0 })).toBe(false);
    expect(isValidInterval({ start: Number.POSITIVE_INFINITY, end: 1 })).toBe(false);
    expect(durationMs(at(0, 90))).toBe(90);
    expect(durationMs(at(4, 4))).toBe(0);
    expect(durationMs({ start: 9, end: 2 })).toBe(0);
  });

  it('detects empty intervals', () => {
    expect(isEmptyInterval(at(2, 2))).toBe(true);
    expect(isEmptyInterval(at(2, 3))).toBe(false);
    expect(isEmptyInterval({ start: 5, end: 4 })).toBe(true);
  });

  it('sorts by start then end without mutating the input', () => {
    const input = [at(5, 9), at(1, 4), at(1, 2)];
    const sorted = sortByStart(input);
    expect(sorted.map((i) => [i.start, i.end])).toEqual([
      [1, 2],
      [1, 4],
      [5, 9],
    ]);
    expect(input[0]).toEqual(at(5, 9));
    expect(sortByStart([])).toEqual([]);
  });
});

describe('overlap predicates', () => {
  it('does not treat touching intervals as overlapping', () => {
    expect(overlaps(at(1, 2), at(2, 3))).toBe(false);
    expect(overlaps(at(1, 3), at(2, 4))).toBe(true);
    expect(overlaps(at(1, 5), at(2, 3))).toBe(true);
    expect(overlaps(at(1, 5), at(1, 5))).toBe(true);
    expect(overlaps(at(1, 5), at(6, 7))).toBe(false);
    expect(overlaps(at(2, 2), at(1, 5))).toBe(false);
  });

  it('detects touching in both directions only', () => {
    expect(touches(at(1, 2), at(2, 3))).toBe(true);
    expect(touches(at(2, 3), at(1, 2))).toBe(true);
    expect(touches(at(1, 2), at(3, 4))).toBe(false);
    expect(touches(at(1, 4), at(2, 3))).toBe(false);
    expect(touches(at(2, 2), at(2, 3))).toBe(false);
  });

  it('combines both into intersects', () => {
    expect(intersects(at(1, 2), at(2, 3))).toBe(true);
    expect(intersects(at(1, 3), at(2, 4))).toBe(true);
    expect(intersects(at(1, 2), at(3, 4))).toBe(false);
  });

  it('computes intersections and nulls', () => {
    expect(intersection(at(1, 5), at(3, 9))).toEqual(at(3, 5));
    expect(intersection(at(1, 5), at(5, 9))).toBeNull();
    expect(intersection(at(1, 5), at(2, 3))).toEqual(at(2, 3));
    expect(intersection(at(1, 5), at(5, 5))).toBeNull();
  });

  it('groups mutually overlapping intervals in a deterministic order', () => {
    const groups = findOverlaps([at(10, 20), at(1, 4), at(2, 6), at(5, 7), at(30, 31)]);
    expect(groups).toEqual([[at(1, 4), at(2, 6), at(5, 7)]]);
    expect(findOverlaps([at(1, 2), at(3, 4)])).toEqual([]);
    expect(findOverlaps([])).toEqual([]);
    expect(findOverlaps([at(1, 5), at(2, 3)])).toEqual([[at(1, 5), at(2, 3)]]);
  });

  it('chains groups transitively without reporting touching pairs', () => {
    expect(findOverlaps([at(1, 3), at(2, 4), at(4, 6)])).toEqual([[at(1, 3), at(2, 4)]]);
    expect(findOverlaps([at(1, 3), at(2, 4), at(3, 6)])).toEqual([
      [at(1, 3), at(2, 4), at(3, 6)],
    ]);
  });
});

describe('union and normalisation', () => {
  it('merges overlapping and touching intervals', () => {
    expect(union([at(1, 3), at(3, 5)])).toEqual([at(1, 5)]);
    expect(union([at(1, 3), at(2, 5)])).toEqual([at(1, 5)]);
    expect(union([at(5, 7), at(1, 3)])).toEqual([at(1, 3), at(5, 7)]);
  });

  it('absorbs nested and duplicate intervals', () => {
    expect(union([at(1, 10), at(3, 4), at(1, 10)])).toEqual([at(1, 10)]);
  });

  it('handles empty input, single elements and empty intervals', () => {
    expect(union([])).toEqual([]);
    expect(union([at(4, 4)])).toEqual([]);
    expect(union([at(2, 8)])).toEqual([at(2, 8)]);
    expect(union([at(2, 8), at(5, 5)])).toEqual([at(2, 8)]);
  });

  it('exposes normalisation as an alias of union', () => {
    expect(normalizeIntervals).toBe(union);
  });

  it('sums the union rather than raw durations', () => {
    expect(totalDurationMs([at(1, 5), at(3, 7)])).toBe(6);
    expect(totalDurationMs([])).toBe(0);
    expect(totalDurationMs([at(1, 5), at(5, 9)])).toBe(8);
  });
});

describe('set operations', () => {
  it('subtracts one interval into zero, one or two pieces', () => {
    expect(difference(at(1, 5), at(9, 10))).toEqual([at(1, 5)]);
    expect(difference(at(1, 5), at(5, 9))).toEqual([at(1, 5)]);
    expect(difference(at(1, 5), at(2, 4))).toEqual([at(1, 2), at(4, 5)]);
    expect(difference(at(1, 5), at(1, 5))).toEqual([]);
    expect(difference(at(1, 5), at(0, 9))).toEqual([]);
    expect(difference(at(1, 5), at(0, 3))).toEqual([at(3, 5)]);
    expect(difference(at(2, 2), at(1, 3))).toEqual([]);
  });

  it('subtracts many removals at once', () => {
    expect(subtractAll(at(0, 10), [at(2, 3), at(5, 6)])).toEqual([at(0, 2), at(3, 5), at(6, 10)]);
    expect(subtractAll(at(0, 10), [])).toEqual([at(0, 10)]);
    expect(subtractAll(at(0, 10), [at(0, 10)])).toEqual([]);
    expect(subtractAll(at(0, 10), [at(20, 30)])).toEqual([at(0, 10)]);
    expect(subtractAll(at(0, 10), [at(3, 4), at(4, 5)])).toEqual([at(0, 3), at(5, 10)]);
    expect(subtractAll(at(0, 10), [at(-5, 1), at(9, 15)])).toEqual([at(1, 9)]);
  });

  it('subtracts sets and normalises both sides', () => {
    const result = subtractSets([at(0, 10), at(8, 12)], [at(1, 2), at(11, 12)]);
    expect(result).toEqual([at(0, 1), at(2, 11)]);
    expect(subtractSets([], [at(1, 2)])).toEqual([]);
    expect(subtractSets([at(0, 5)], [])).toEqual([at(0, 5)]);
  });

  it('intersects sets with a sweep', () => {
    expect(intersectSets([at(0, 10)], [at(2, 4), at(6, 12)])).toEqual([at(2, 4), at(6, 10)]);
    expect(intersectSets([at(0, 1)], [at(5, 6)])).toEqual([]);
    expect(intersectSets([], [at(1, 2)])).toEqual([]);
    expect(intersectSets([at(0, 5), at(4, 9)], [at(3, 6)])).toEqual([at(3, 6)]);
  });
});

describe('splitAt', () => {
  it('cuts at inner points and ignores outside ones', () => {
    expect(splitAt(at(0, 10), [4, 7])).toEqual([at(0, 4), at(4, 7), at(7, 10)]);
    expect(splitAt(at(0, 10), [-5, 0, 10, 20])).toEqual([at(0, 10)]);
    expect(splitAt(at(0, 10), [])).toEqual([at(0, 10)]);
  });

  it('collapses duplicate points and keeps the duration', () => {
    expect(splitAt(at(0, 10), [5, 5, 5])).toEqual([at(0, 5), at(5, 10)]);
    expect(splitAt(at(0, 10), [10, 0])).toEqual([at(0, 10)]);
    expect(splitAt(at(3, 3), [3])).toEqual([]);
  });
});

describe('clampTo and coverage', () => {
  it('clamps intervals into bounds', () => {
    expect(clampTo(at(0, 10), at(3, 7))).toEqual(at(3, 7));
    expect(clampTo(at(0, 10), at(-5, 4))).toEqual(at(0, 4));
    expect(clampTo(at(0, 10), at(20, 30))).toBeNull();
    expect(clampTo(at(0, 10), at(10, 20))).toBeNull();
    expect(clampTo(at(2, 3), at(0, 10))).toEqual(at(2, 3));
  });

  it('reports gaps above the threshold', () => {
    expect(gapsWithin(at(0, 100), [at(10, 20), at(40, 50)], 0)).toEqual([
      at(0, 10),
      at(20, 40),
      at(50, 100),
    ]);
    expect(gapsWithin(at(0, 100), [at(10, 20), at(40, 50)], 25)).toEqual([at(50, 100)]);
    expect(gapsWithin(at(0, 100), [at(0, 100)], 0)).toEqual([]);
    expect(gapsWithin(at(0, 100), [], 0)).toEqual([at(0, 100)]);
    expect(gapsWithin(at(5, 5), [], 0)).toEqual([]);
  });

  it('computes coverage ratios bounded to [0, 1]', () => {
    expect(coverageRatio([at(0, 50)], at(0, 100))).toBe(0.5);
    expect(coverageRatio([], at(0, 100))).toBe(0);
    expect(coverageRatio([at(-50, 150)], at(0, 100))).toBe(1);
    expect(coverageRatio([at(0, 100)], at(5, 5))).toBe(0);
    expect(coverageRatio([at(0, 30), at(20, 50)], at(0, 100))).toBeCloseTo(0.5, 10);
  });
});
