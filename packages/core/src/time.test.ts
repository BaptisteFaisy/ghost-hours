import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  addDaysInZone,
  dayKeyInZone,
  isSameDayInZone,
  startOfDayInZone,
  zonedParts,
  zonedTimeToInstant,
} from './time.ts';
import { parseClock } from './time.ts';

const PARIS = 'Europe/Paris';

describe('zoned time helpers', () => {
  it('round-trips zoned parts across a standard date', () => {
    const instant = Date.UTC(2026, 10, 11, 14, 30, 0);
    const parts = zonedParts(instant, PARIS);
    expect([parts.year, parts.month, parts.day]).toEqual([2026, 11, 11]);
    expect(parts.hour).toBe(15); // UTC+1 in winter
    expect(zonedTimeToInstant(parts, PARIS)).toBe(instant);
  });

  it('keeps the local clock across a DST change', () => {
    const before = zonedTimeToInstant({ year: 2026, month: 10, day: 24, hour: 9 }, PARIS);
    const after = zonedTimeToInstant({ year: 2026, month: 10, day: 26, hour: 9 }, PARIS);
    expect(zonedParts(before, PARIS).hour).toBe(9);
    expect(zonedParts(after, PARIS).hour).toBe(9);
    // A day that lasts 25 hours still starts at 00:00 local.
    const dayStart = startOfDayInZone(zonedTimeToInstant({ year: 2026, month: 10, day: 25 }, PARIS), PARIS);
    expect(zonedParts(dayStart, PARIS).hour).toBe(0);
  });

  it('parses clocks and rejects malformed ones', () => {
    expect(parseClock('07:00')).toBe(420);
    expect(parseClock('23:45')).toBe(1425);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('nope')).toBeNull();
  });
});

describe('HEU-P-11 — calendar arithmetic is DST safe', () => {
  it('adding days always moves forward and changes the day key', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 28 }), fc.integer({ min: 1, max: 10 }), (day, add) => {
        const start = zonedTimeToInstant({ year: 2026, month: 11, day }, PARIS);
        const next = addDaysInZone(start, add, PARIS);
        expect(next).toBeGreaterThan(start);
        expect(isSameDayInZone(start, next, PARIS)).toBe(false);
      }),
    );
  });

  it('start of day is idempotent', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) }), (instant) => {
        const once = startOfDayInZone(instant, PARIS);
        expect(startOfDayInZone(once, PARIS)).toBe(once);
      }),
    );
  });

  it('day keys agree with zoned parts', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) }), (instant) => {
        const parts = zonedParts(instant, PARIS);
        const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
        expect(dayKeyInZone(instant, PARIS)).toBe(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`);
      }),
    );
  });
});
