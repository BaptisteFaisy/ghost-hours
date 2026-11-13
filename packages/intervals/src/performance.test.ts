import { describe, expect, it } from 'vitest';
import { findOverlaps, totalDurationMs, union } from './index.ts';
import { seededIntervals } from './test-support.ts';

/**
 * Supports HEU-N-03: the algebra must stay linear-ish. The threshold is wide on
 * purpose (200 ms for 5 000 intervals, typically ~5 ms) and the seed is fixed so
 * the input never varies between runs.
 */
describe('performance (HEU-N-03 support)', () => {
  it('merges 5 000 random intervals well under 200 ms', () => {
    const input = seededIntervals(5_000, 20_261_111);
    expect(input).toHaveLength(5_000);

    const startedAt = performance.now();
    const merged = union(input);
    const total = totalDurationMs(input);
    const elapsed = performance.now() - startedAt;

    expect(merged.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
    expect(findOverlaps(merged)).toEqual([]);
    expect(elapsed).toBeLessThan(200);
  });

  it('stays fast on an already sorted, disjoint input', () => {
    const input = seededIntervals(5_000, 4_242).sort((a, b) => a.start - b.start);
    const startedAt = performance.now();
    const merged = union(input);
    const elapsed = performance.now() - startedAt;
    expect(merged.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });
});
