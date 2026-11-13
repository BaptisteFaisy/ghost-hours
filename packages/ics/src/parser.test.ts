import { describe, expect, it } from 'vitest';
import { parseIcs } from './parser.ts';
import { calendar, event, only, report } from './test-support.ts';

const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month - 1, day, hour, minute);

const floatingCalendar = (lines: readonly string[], timeZone = 'Europe/Paris'): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-TIMEZONE:${timeZone}`, event(lines), 'END:VCALENDAR', ''].join('\r\n');

const fullEvent = calendar(
  event([
    'UID:sprint-review@example.org',
    'SUMMARY:Sprint review\\, part 1',
    'DESCRIPTION:Order of the day\\npoint 1\\; point 2',
    'DTSTART;TZID=Europe/Paris:20261103T140000',
    'DTEND;TZID=Europe/Paris:20261103T150000',
    'STATUS:TENTATIVE',
    'SEQUENCE:4',
    'TRANSP:OPAQUE',
    'ORGANIZER;CN="Sofia Marquez":mailto:sarah@example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:malik@example.org',
    'ATTENDEE;PARTSTAT=DECLINED;CN="Yuki Tanaka":mailto:yuki@acme.example.org',
    'ATTENDEE;PARTSTAT=TENTATIVE:mailto:sofia@example.org',
    'EXDATE;TZID=Europe/Paris:20261117T140000,20261110T140000',
    'RDATE;TZID=Europe/Paris:20261104T140000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8',
  ]),
);

describe('parseIcs: TZID, UTC and floating forms', () => {
  it('resolves a TZID value in a valid IANA zone', () => {
    const meeting = only(
      report(
        calendar(
          event([
            'UID:evt-tzid@example.org',
            'SUMMARY:Point hebdo',
            'DTSTART;TZID=Europe/Paris:20261103T140000',
            'DTEND;TZID=Europe/Paris:20261103T150000',
          ]),
        ),
      ),
    );
    expect(meeting.start).toBe(at(2026, 11, 3, 13, 0));
    expect(meeting.end).toBe(at(2026, 11, 3, 14, 0));
    expect(meeting.timeZone).toBe('Europe/Paris');
    expect(meeting.allDay).toBe(false);
    expect(meeting.summary).toBe('Point hebdo');
  });

  it('resolves the UTC form', () => {
    const meeting = only(
      report(calendar(event(['UID:evt-utc@example.org', 'DTSTART:20261103T140000Z', 'DTEND:20261103T143000Z']))),
    );
    expect(meeting.start).toBe(at(2026, 11, 3, 14, 0));
    expect(meeting.timeZone).toBe('UTC');
  });

  it('interprets a floating time in X-WR-TIMEZONE', () => {
    const meeting = only(report(floatingCalendar(['UID:evt-floating@example.org', 'DTSTART:20261103T090000'])));
    expect(meeting.start).toBe(at(2026, 11, 3, 8, 0));
    expect(meeting.timeZone).toBeNull();
  });

  it('lets options.defaultTimeZone win over X-WR-TIMEZONE', () => {
    const text = floatingCalendar(['UID:evt-floating@example.org', 'DTSTART:20261103T090000']);
    expect(only(report(text, { defaultTimeZone: 'UTC' })).start).toBe(at(2026, 11, 3, 9, 0));
  });

  it('warns and falls back when the declared default zone is unknown', () => {
    const value = report(floatingCalendar(['UID:evt-floating@example.org', 'DTSTART:20261103T090000'], 'Mars/Olympus'));
    expect(value.warnings.join(' | ')).toContain('unknown default time zone "Mars/Olympus"');
    expect(only(value).start).toBe(at(2026, 11, 3, 8, 0));
  });
});

describe('parseIcs: all-day and duration forms', () => {
  it('marks VALUE=DATE as an all-day event lasting one day', () => {
    const day = only(report(floatingCalendar(['UID:evt-allday@example.org', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:20261103'])));
    expect(day.allDay).toBe(true);
    expect(day.start).toBe(at(2026, 11, 2, 23, 0));
    expect(day.end).toBe(at(2026, 11, 3, 23, 0));
  });

  it('accepts DURATION when DTEND is absent', () => {
    const meeting = only(
      report(calendar(event(['UID:evt-duration@example.org', 'DTSTART;TZID=Europe/Paris:20261103T140000', 'DURATION:PT45M']))),
    );
    expect(meeting.end - meeting.start).toBe(45 * 60_000);
  });

  it('defaults a timed event without DTEND or DURATION to zero length', () => {
    const meeting = only(report(calendar(event(['UID:evt-noend@example.org', 'DTSTART:20261103T140000Z']))));
    expect(meeting.end).toBe(meeting.start);
  });
});

describe('parseIcs: text and status properties', () => {
  it('unescapes the summary and the description', () => {
    const meeting = only(report(fullEvent));
    expect(meeting.summary).toBe('Sprint review, part 1');
    expect(meeting.description).toBe('Order of the day\npoint 1; point 2');
  });

  it('reads status, sequence, transparency and organizer', () => {
    const meeting = only(report(fullEvent));
    expect(meeting.status).toBe('tentative');
    expect(meeting.sequence).toBe(4);
    expect(meeting.transp).toBe('opaque');
    expect(meeting.organizerEmail).toBe('sarah@example.com');
  });

  it('reads every attendee with its participation status', () => {
    expect(only(report(fullEvent)).attendees).toEqual([
      { email: 'malik@example.org', partStat: 'accepted' },
      { email: 'yuki@acme.example.org', partStat: 'declined' },
      { email: 'sofia@example.org', partStat: 'tentative' },
    ]);
  });

  it('warns about an unknown STATUS instead of dropping the event', () => {
    const value = report(calendar(event(['UID:evt@example.org', 'DTSTART:20261103T140000Z', 'STATUS:MAYBE'])));
    expect(value.events).toHaveLength(1);
    expect(value.warnings.join(' | ')).toContain('STATUS "MAYBE"');
  });
});

describe('parseIcs: recurrence properties', () => {
  it('reads EXDATE, RDATE and RRULE, sorted and deduplicated', () => {
    const meeting = only(report(fullEvent));
    expect(meeting.exdates).toEqual([at(2026, 11, 10, 13, 0), at(2026, 11, 17, 13, 0)]);
    expect(meeting.rdates).toEqual([at(2026, 11, 4, 13, 0)]);
    expect(meeting.rrule).toBe('FREQ=WEEKLY;BYDAY=TU;COUNT=8');
    expect(meeting.recurrenceId).toBeNull();
  });

  it('keeps the raw properties', () => {
    const meeting = only(report(fullEvent));
    expect(meeting.raw['UID']).toBe('sprint-review@example.org');
    expect(meeting.raw['DTSTART']).toBe('20261103T140000');
    expect(meeting.raw['RRULE']).toBe('FREQ=WEEKLY;BYDAY=TU;COUNT=8');
  });
});

const vtimezone = [
  'BEGIN:VTIMEZONE',
  'TZID:Acme Standard Time',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

const customZoneCalendar = calendar(
  vtimezone,
  event(['UID:evt-winter@example.org', 'SUMMARY:Point hebdo', 'DTSTART;TZID=Acme Standard Time:20261103T140000']),
  event(['UID:evt-summer@example.org', 'SUMMARY:Sprint review', 'DTSTART;TZID=Acme Standard Time:20260715T140000']),
);

describe('parseIcs: VTIMEZONE for a non-IANA TZID', () => {
  it('applies the standard offset in winter', () => {
    const [winter] = report(customZoneCalendar).events;
    expect(winter?.start).toBe(at(2026, 11, 3, 13, 0));
    expect(winter?.timeZone).toBe('Acme Standard Time');
  });

  it('applies the daylight offset in summer', () => {
    const [, summer] = report(customZoneCalendar).events;
    expect(summer?.start).toBe(at(2026, 7, 15, 12, 0));
  });

  it('skips an event whose TZID is neither IANA nor declared, with the exact reason', () => {
    const value = report(calendar(event(['UID:evt-mars@example.org', 'DTSTART;TZID=Mars/Olympus:20261103T140000'])));
    expect(value.events).toHaveLength(0);
    expect(value.skipped).toEqual([
      {
        line: 4,
        uid: 'evt-mars@example.org',
        reason: 'invalid DTSTART: unknown time zone "Mars/Olympus" (not an IANA identifier and no VTIMEZONE)',
      },
    ]);
  });
});

const broken = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'SUMMARY:No uid here',
  'DTSTART:20261103T140000Z',
  'END:VEVENT',
  'BEGIN:VTODO',
  'UID:todo-1@example.org',
  'SUMMARY:Write the report',
  'END:VTODO',
  'BEGIN:VJOURNAL',
  'UID:journal-1@example.org',
  'END:VJOURNAL',
  'garbage line without colon',
  'BEGIN:VEVENT',
  'UID:evt-open@example.org',
  'SUMMARY:Point hebdo',
  'DTSTART:20261103T140000Z',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('parseIcs: damaged files (risk D.15)', () => {
  it('never throws and lists the event it dropped', () => {
    expect(() => parseIcs(broken)).not.toThrow();
    const value = report(broken);
    expect(value.events.map((meeting) => meeting.uid)).toEqual(['evt-open@example.org']);
    expect(value.skipped).toEqual([{ line: 3, reason: 'missing UID' }]);
  });

  it('counts VTODO and VJOURNAL components in the warnings', () => {
    const warnings = report(broken).warnings.join(' | ');
    expect(warnings).toContain('1 VTODO component(s) ignored');
    expect(warnings).toContain('1 VJOURNAL component(s) ignored');
  });

  it('reports malformed lines and mismatched END markers', () => {
    const warnings = report(broken).warnings.join(' | ');
    expect(warnings).toContain('line 14: not a content line, ignored');
    expect(warnings).toContain('END:VCALENDAR closes BEGIN:VEVENT');
    expect(warnings).toContain('BEGIN:VCALENDAR is never closed');
  });

  it('survives a truncated file with no END at all', () => {
    const truncated = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:evt-cut@example.org\r\nDTSTART:20261103T140000Z\r\n';
    const value = report(truncated);
    expect(value.events).toHaveLength(1);
    expect(value.warnings.join(' | ')).toContain('BEGIN:VEVENT is never closed');
  });

  it('rejects a file that is not an iCalendar stream', () => {
    const result = parseIcs('hello world');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('no BEGIN:VCALENDAR');
  });

  it('turns skipped items into errors in strict mode', () => {
    const result = parseIcs(broken, { strict: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' | ')).toContain('missing UID');
  });

  it('accepts a clean file in strict mode', () => {
    const clean = calendar(event(['UID:evt-clean@example.org', 'DTSTART:20261103T140000Z', 'DTEND:20261103T150000Z']));
    expect(parseIcs(clean, { strict: true }).ok).toBe(true);
  });
});
