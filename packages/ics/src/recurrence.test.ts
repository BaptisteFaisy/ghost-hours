import { describe, expect, it } from 'vitest';
import type { IcsEvent } from './types.ts';
import { expandRecurring } from './expand.ts';
import { report } from './test-support.ts';
import { calendar, event } from './test-support.ts';

const TZ = 'Europe/Paris';
const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month - 1, day, hour, minute);

/** One recurring meeting: 14:00–15:00 Paris every Tuesday unless stated. */
function recurring(rrule: string, extra: readonly string[] = []): readonly IcsEvent[] {
  return report(
    calendar(
      event([
        'UID:point-hebdo@example.org',
        'SUMMARY:Point hebdo',
        'DTSTART;TZID=Europe/Paris:20261103T140000',
        'DTEND;TZID=Europe/Paris:20261103T150000',
        rrule,
        ...extra,
      ]),
    ),
  ).events;
}

const year2026 = { start: at(2026, 1, 1), end: at(2027, 1, 1) };
const wide = { start: at(2026, 1, 1), end: at(2029, 1, 1) };
const starts = (events: readonly IcsEvent[]): number[] => events.map((meeting) => meeting.start);

describe('expandRecurring: frequencies', () => {
  it('expands DAILY with COUNT', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;COUNT=5'), year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([3, 4, 5, 6, 7].map((day) => at(2026, 11, day, 13, 0)));
  });

  it('expands WEEKLY on BYDAY, ordered by WKST', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6'), year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([
      at(2026, 11, 4, 13, 0),
      at(2026, 11, 9, 13, 0),
      at(2026, 11, 11, 13, 0),
      at(2026, 11, 16, 13, 0),
      at(2026, 11, 18, 13, 0),
      at(2026, 11, 23, 13, 0),
    ]);
  });

  it('skips months that are too short for BYMONTHDAY', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3'), wide, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([at(2026, 12, 31, 13, 0), at(2027, 1, 31, 13, 0), at(2027, 3, 31, 12, 0)]);
  });

  it('expands MONTHLY on an ordinal BYDAY', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=2'), year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([at(2026, 11, 10, 13, 0), at(2026, 12, 8, 13, 0)]);
  });

  it('expands YEARLY on the last Sunday of a month', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;COUNT=2'), wide, {
      defaultTimeZone: TZ,
    });
    expect(starts(events)).toEqual([at(2027, 3, 28, 12, 0), at(2028, 3, 26, 12, 0)]);
  });

  it('honours UNTIL as a UTC date-time, inclusively', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;UNTIL=20261105T130000Z'), year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([3, 4, 5].map((day) => at(2026, 11, day, 13, 0)));
  });

  it('honours UNTIL as a floating date', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;UNTIL=20261105'), year2026, { defaultTimeZone: TZ });
    expect(events).toHaveLength(3);
  });

  it('honours INTERVAL', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;INTERVAL=7;COUNT=3'), year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([at(2026, 11, 3, 13, 0), at(2026, 11, 10, 13, 0), at(2026, 11, 17, 13, 0)]);
  });
});

describe('expandRecurring: exceptions and additions', () => {
  it('removes EXDATE and adds RDATE', () => {
    const events = expandRecurring(
      recurring('RRULE:FREQ=DAILY;COUNT=3', [
        'EXDATE;TZID=Europe/Paris:20261104T140000',
        'RDATE;TZID=Europe/Paris:20261110T140000',
      ]),
      year2026,
      { defaultTimeZone: TZ },
    );
    expect(starts(events)).toEqual([at(2026, 11, 3, 13, 0), at(2026, 11, 5, 13, 0), at(2026, 11, 10, 13, 0)]);
  });

  it('treats a non-recurring event as a single occurrence', () => {
    const single = report(
      calendar(event(['UID:evt-one@example.org', 'DTSTART:20261103T140000Z', 'DTEND:20261103T150000Z'])),
    ).events;
    expect(expandRecurring(single, year2026, { defaultTimeZone: TZ })).toHaveLength(1);
  });

  it('respects the range: inclusive start, exclusive end', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;COUNT=10'), {
      start: at(2026, 11, 4, 13, 0),
      end: at(2026, 11, 6, 13, 0),
    }, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([at(2026, 11, 4, 13, 0), at(2026, 11, 5, 13, 0)]);
  });

  it('stops at the limit and warns about it', () => {
    const warnings: string[] = [];
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;COUNT=10'), year2026, {
      defaultTimeZone: TZ,
      limit: 2,
      onWarning: (message) => warnings.push(message),
    });
    expect(events).toHaveLength(2);
    expect(warnings.join(' | ')).toContain('occurrence limit');
  });

  it('keeps an occurrence duration exact', () => {
    const events = expandRecurring(recurring('RRULE:FREQ=DAILY;COUNT=3'), year2026, { defaultTimeZone: TZ });
    for (const meeting of events) expect(meeting.end - meeting.start).toBe(60 * 60_000);
  });
});

describe('expandRecurring: exotic rules are reported, not guessed', () => {
  it('warns about BYSETPOS at parse time and expands plainly', () => {
    const value = report(
      calendar(
        event([
          'UID:evt-setpos@example.org',
          'DTSTART:20261103T140000Z',
          'DTEND:20261103T150000Z',
          'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1;COUNT=2',
        ]),
      ),
    );
    expect(value.warnings.join(' | ')).toContain('BYSETPOS is not supported');
    const events = expandRecurring(value.events, year2026, { defaultTimeZone: TZ });
    expect(events.length).toBeGreaterThan(0);
  });

  it('warns about an unsupported frequency', () => {
    const value = report(
      calendar(event(['UID:evt-hourly@example.org', 'DTSTART:20261103T140000Z', 'RRULE:FREQ=HOURLY;COUNT=4'])),
    );
    expect(value.warnings.join(' | ')).toContain('unsupported RRULE frequency');
  });
});

describe('expandRecurring: bounded work', () => {
  it('terminates on a rule that can never match', () => {
    const value = report(
      calendar(
        event([
          'UID:evt-impossible@example.org',
          'DTSTART:20261103T140000Z',
          'DTEND:20261103T150000Z',
          'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30',
        ]),
      ),
    );
    const started = Date.now();
    const events = expandRecurring(value.events, year2026, { defaultTimeZone: TZ });
    expect(events).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('keeps a VTIMEZONE event on its declared offset when recurring (documented limit)', () => {
    const custom = [
      'BEGIN:VTIMEZONE',
      'TZID:Acme Standard Time',
      'BEGIN:STANDARD',
      'DTSTART:19701025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
    ].join('\r\n');
    const value = report(
      calendar(
        custom,
        event([
          'UID:evt-custom@example.org',
          'DTSTART;TZID=Acme Standard Time:20261103T140000',
          'DTEND;TZID=Acme Standard Time:20261103T150000',
          'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3',
        ]),
      ),
    );
    const events = expandRecurring(value.events, year2026, { defaultTimeZone: TZ });
    expect(starts(events)).toEqual([at(2026, 11, 3, 13, 0), at(2026, 11, 10, 13, 0), at(2026, 11, 17, 13, 0)]);
  });
});
