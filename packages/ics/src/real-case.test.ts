/**
 * A realistic agenda: a weekly meeting over eight weeks with one cancelled week
 * (EXDATE) and one week moved (RECURRENCE-ID), as Google Calendar and Outlook
 * both export them.
 */

import { describe, expect, it } from 'vitest';
import { expandRecurring } from './expand.ts';
import { calendar, event, report } from './test-support.ts';
import { toEvidence } from './evidence.ts';

const TZ = 'Europe/Paris';
const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month - 1, day, hour, minute);

const agenda = calendar(
  event([
    'UID:sprint-review@example.org',
    'SUMMARY:Sprint review',
    'DTSTART;TZID=Europe/Paris:20261103T140000',
    'DTEND;TZID=Europe/Paris:20261103T150000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8',
    'STATUS:CONFIRMED',
    'ORGANIZER;CN="Sofia Marquez":mailto:sarah@example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED;CN="Malik Osei":mailto:malik@example.org',
    'EXDATE;TZID=Europe/Paris:20261117T140000',
  ]),
  event([
    'UID:sprint-review@example.org',
    'SUMMARY:Sprint review (moved)',
    'DTSTART;TZID=Europe/Paris:20261203T100000',
    'DTEND;TZID=Europe/Paris:20261203T110000',
    'RECURRENCE-ID;TZID=Europe/Paris:20261201T140000',
    'SEQUENCE:1',
    'STATUS:CONFIRMED',
    'ORGANIZER:mailto:sarah@example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:malik@example.org',
  ]),
  event(['UID:acme-offsite@example.org', 'SUMMARY:Acme offsite', 'DTSTART;VALUE=DATE:20261105']),
);

const range = { start: at(2026, 11, 1), end: at(2027, 1, 1) };

describe('a real weekly agenda', () => {
  const events = report(agenda).events;
  const occurrences = expandRecurring(events, range, { defaultTimeZone: TZ });

  it('reads both the master event and its overridden occurrence', () => {
    expect(events).toHaveLength(3);
    expect(events.map((meeting) => meeting.uid)).toEqual([
      'sprint-review@example.org',
      'sprint-review@example.org',
      'acme-offsite@example.org',
    ]);
  });

  it('expands eight weekly slots, minus the EXDATE, plus the moved occurrence', () => {
    const review = occurrences.filter((meeting) => meeting.uid === 'sprint-review@example.org');
    expect(review).toHaveLength(7);
    expect(review.map((meeting) => meeting.start)).toEqual([
      at(2026, 11, 3, 13, 0),
      at(2026, 11, 10, 13, 0),
      at(2026, 11, 24, 13, 0),
      at(2026, 12, 3, 9, 0),
      at(2026, 12, 8, 13, 0),
      at(2026, 12, 15, 13, 0),
      at(2026, 12, 22, 13, 0),
    ]);
  });

  it('drops the cancelled week and the slot replaced by RECURRENCE-ID', () => {
    const review = occurrences.filter((meeting) => meeting.uid === 'sprint-review@example.org');
    expect(review.map((meeting) => meeting.start)).not.toContain(at(2026, 11, 17, 13, 0));
    expect(review.map((meeting) => meeting.start)).not.toContain(at(2026, 12, 1, 13, 0));
  });

  it('keeps the moved occurrence title and duration', () => {
    const moved = occurrences.find((meeting) => meeting.summary === 'Sprint review (moved)');
    expect(moved?.start).toBe(at(2026, 12, 3, 9, 0));
    expect(moved?.end).toBe(at(2026, 12, 3, 10, 0));
    expect(moved?.recurrenceId).toBe(at(2026, 12, 1, 13, 0));
  });

  it('gives every occurrence of the meeting the same one-hour duration', () => {
    for (const meeting of occurrences.filter((item) => item.uid === 'sprint-review@example.org')) {
      expect(meeting.end - meeting.start).toBe(60 * 60_000);
    }
  });

});

describe('a real weekly agenda, turned into evidence', () => {
  const occurrences = expandRecurring(report(agenda).events, range, { defaultTimeZone: TZ });

  it('turns the meetings into evidence and leaves the all-day event aside', () => {
    const evidence = toEvidence(occurrences, { defaultTimeZone: TZ });
    expect(evidence).toHaveLength(7);
    expect(evidence.map((item) => item.kind)).toEqual(Array(7).fill('meeting'));
    expect(evidence[0]?.id).toBe('ics:sprint-review@example.org:1793710800000');
    expect(evidence[0]?.attendees).toEqual([{ email: 'malik@example.org', partStat: 'accepted' }]);
    expect(evidence.every((item) => item.recurring === true)).toBe(true);
    expect(evidence.some((item) => item.allDay === true)).toBe(false);
  });

  it('produces the same evidence when the same file is imported twice', () => {
    const again = expandRecurring(report(agenda).events, range, { defaultTimeZone: TZ });
    expect(toEvidence(again).map((item) => item.id)).toEqual(toEvidence(occurrences).map((item) => item.id));
  });
});
