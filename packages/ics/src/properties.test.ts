import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { dayKeyInZone, formatClockInZone, zonedParts } from '@ghost-hours/core';
import type { Instant } from '@ghost-hours/core';
import { civilToMs } from './civil.ts';
import { dayNumber, fromDayNumber } from './civil.ts';
import { expandRecurring } from './expand.ts';
import { calendar, event, report, stamp, utcStamp } from './test-support.ts';
import type { IcsEvent } from './types.ts';

const TZ = 'Europe/Paris';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month - 1, day, hour, minute);
const base = at(2026, 1, 1);
const wide = { start: base, end: base + 5 * 365 * DAY };

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface Spec {
  readonly freq: Freq;
  readonly interval: number;
  readonly count: number;
  readonly byDay: readonly string[];
  readonly monthDay: number | null;
  readonly withUntil: boolean;
}

const arbSpec: fc.Arbitrary<Spec> = fc.record({
  freq: fc.constantFrom<Freq>('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'),
  interval: fc.integer({ min: 1, max: 3 }),
  count: fc.integer({ min: 1, max: 20 }),
  byDay: fc.uniqueArray(fc.constantFrom('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'), { maxLength: 3 }),
  monthDay: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
  withUntil: fc.boolean(),
});

function rruleOf(spec: Spec): string {
  const parts = [`FREQ=${spec.freq}`, `INTERVAL=${spec.interval}`, `COUNT=${spec.count}`];
  if (spec.freq === 'WEEKLY' && spec.byDay.length > 0) parts.push(`BYDAY=${spec.byDay.join(',')}`);
  if (spec.freq === 'MONTHLY' && spec.monthDay !== null) parts.push(`BYMONTHDAY=${spec.monthDay}`);
  if (spec.withUntil) parts.push('UNTIL=20270301T090000Z');
  return `RRULE:${parts.join(';')}`;
}

/** A Monday 09:00 UTC meeting, recurring as described. */
function fixture(spec: Spec, exdates: readonly number[] = []): string {
  const lines = [
    'UID:point-hebdo@example.org',
    'SUMMARY:Point hebdo',
    'DTSTART:20260105T090000Z',
    'DTEND:20260105T100000Z',
    rruleOf(spec),
  ];
  if (exdates.length > 0) lines.push(`EXDATE:${exdates.map(utcStamp).join(',')}`);
  return calendar(event(lines));
}

const key = (meeting: IcsEvent): string => `${meeting.uid}@${meeting.start}`;
const starts = (events: readonly IcsEvent[]): number[] => events.map((meeting) => meeting.start);

function expectWindowConsistency(
  events: readonly IcsEvent[],
  all: readonly IcsEvent[],
  offsetDays: number,
  lengthDays: number,
): void {
  const windowStart = base + offsetDays * DAY;
  const window = { start: windowStart, end: windowStart + lengthDays * DAY };
  const narrow = expandRecurring(events, window, { defaultTimeZone: TZ });
  for (const meeting of narrow) {
    expect(meeting.start).toBeGreaterThanOrEqual(window.start);
    expect(meeting.start).toBeLessThan(window.end);
  }
  const expected = starts(all).filter((start) => start >= window.start && start < window.end);
  expect(starts(narrow)).toEqual(expected);
}

function expectExdatesRespected(spec: Spec, all: readonly IcsEvent[], picks: readonly number[]): void {
  const excluded = [...new Set(picks.map((index) => all[index]?.start).filter((s): s is number => s !== undefined))];
  const withExdates = expandRecurring(report(fixture(spec, excluded)).events, wide, { defaultTimeZone: TZ });
  for (const start of excluded) expect(starts(withExdates)).not.toContain(start);
  expect(withExdates.length).toBe(all.length - excluded.length);
}

describe('HEU-P-12 — recurrence expansion', () => {
  it('HEU-P-12: occurrences stay inside the window, without duplicates, COUNT and EXDATE respected', () => {
    fc.assert(
      fc.property(
        arbSpec,
        fc.integer({ min: 0, max: 1500 }),
        fc.integer({ min: 1, max: 120 }),
        fc.array(fc.integer({ min: 0, max: 19 }), { maxLength: 3 }),
        (spec, offsetDays, lengthDays, picks) => {
          const events = report(fixture(spec)).events;
          const all = expandRecurring(events, wide, { defaultTimeZone: TZ });
          expect(all.length).toBeLessThanOrEqual(spec.count);
          expect(new Set(all.map(key)).size).toBe(all.length);
          expect(starts(all)).toEqual([...starts(all)].sort((a, b) => a - b));
          expectWindowConsistency(events, all, offsetDays, lengthDays);
          expectExdatesRespected(spec, all, picks);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('HEU-P-12: parsing twice gives the same events in the same order', () => {
    fc.assert(
      fc.property(arbSpec, (spec) => {
        const first = report(fixture(spec));
        const second = report(fixture(spec));
        expect(second.events).toEqual(first.events);
        expect(second.warnings).toEqual(first.warnings);
      }),
      { numRuns: 60 },
    );
  });

  it('HEU-P-12: the order of EXDATE and RDATE lines changes nothing', () => {
    const lines = ['UID:evt-order@example.org', 'DTSTART:20261103T090000Z', 'DTEND:20261103T100000Z', 'RRULE:FREQ=DAILY;COUNT=5'];
    const first = report(calendar(event([...lines, 'EXDATE:20261104T090000Z,20261105T090000Z', 'RDATE:20261110T090000Z'])));
    const second = report(calendar(event([...lines, 'RDATE:20261110T090000Z', 'EXDATE:20261105T090000Z', 'EXDATE:20261104T090000Z'])));
    const shape = (events: readonly IcsEvent[]): unknown =>
      events.map((meeting) => ({ start: meeting.start, end: meeting.end, exdates: meeting.exdates, rdates: meeting.rdates }));
    expect(shape(second.events)).toEqual(shape(first.events));
    expect(starts(expandRecurring(second.events, wide, { defaultTimeZone: TZ }))).toEqual(
      starts(expandRecurring(first.events, wide, { defaultTimeZone: TZ })),
    );
  });
});

const dstRange = { start: at(2026, 1, 1), end: at(2028, 1, 1) };

function dailyFixture(date: { year: number; month: number; day: number }, count: number): string {
  return calendar(
    event([
      'UID:sprint-review@example.org',
      'SUMMARY:Sprint review',
      `DTSTART;TZID=${TZ}:${stamp(date, 'T090000')}`,
      `DTEND;TZID=${TZ}:${stamp(date, 'T100000')}`,
      `RRULE:FREQ=DAILY;COUNT=${count}`,
    ]),
  );
}

/** Elapsed wall-clock time between two instants, read in `timeZone`. */
function civilElapsed(start: Instant, end: Instant, timeZone: string): number {
  const from = zonedParts(start, timeZone);
  const to = zonedParts(end, timeZone);
  return civilToMs({ ...to }) - civilToMs({ ...from });
}

describe('HEU-P-11 — durations and DST', () => {
  it('HEU-P-11: a 09:00 meeting keeps its local clock and its duration all year long', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), (offsetDays) => {
        const date = fromDayNumber(dayNumber({ year: 2026, month: 1, day: 1 }) + offsetDays);
        const events = expandRecurring(report(dailyFixture(date, 3)).events, dstRange, { defaultTimeZone: TZ });
        expect(events).toHaveLength(3);
        for (const meeting of events) {
          expect(meeting.end - meeting.start).toBe(HOUR);
          expect(formatClockInZone(meeting.start, TZ)).toBe('09:00');
          expect(formatClockInZone(meeting.end, TZ)).toBe('10:00');
        }
      }),
      { numRuns: 80 },
    );
  });

  // Autumn transition (Europe/Paris falls back from UTC+2 to UTC+1 at 03:00):
  // the same 09:00 local meeting starts one hour later in UTC.
  it('HEU-P-11: the start instant shifts by one hour across the autumn transition', () => {
    const events = expandRecurring(report(dailyFixture({ year: 2027, month: 10, day: 25 }, 10)).events, {
      start: at(2027, 10, 24),
      end: at(2027, 11, 5),
    }, { defaultTimeZone: TZ });
    const before = events.find((meeting) => dayKeyInZone(meeting.start, TZ) === '2027-10-30');
    const after = events.find((meeting) => dayKeyInZone(meeting.start, TZ) === '2027-10-31');
    expect(before?.start).toBe(at(2027, 10, 30, 7, 0));
    expect(after?.start).toBe(at(2027, 10, 31, 8, 0));
    expect(after && after.end - after.start).toBe(HOUR);
  });

  it('HEU-P-11: the duration is the same in every display zone', () => {
    const zones = ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo'];
    const events = expandRecurring(report(dailyFixture({ year: 2026, month: 10, day: 20 }, 10)).events, dstRange, {
      defaultTimeZone: TZ,
    });
    expect(events).toHaveLength(10);
    for (const meeting of events) {
      expect(meeting.end - meeting.start).toBe(HOUR);
      for (const zone of zones) expect(civilElapsed(meeting.start, meeting.end, zone)).toBe(HOUR);
      expect(formatClockInZone(meeting.start, TZ)).toBe('09:00');
    }
  });
});
