import { describe, expect, it } from 'vitest';
import { toEvidence } from './evidence.ts';
import { skipReason } from './skip.ts';
import { calendar, event, report } from './test-support.ts';

const TZ = 'Europe/Paris';
const at = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month - 1, day, hour, minute);

const agenda = calendar(
  event([
    'UID:point-hebdo@example.org',
    'SUMMARY:Point hebdo',
    'DTSTART;TZID=Europe/Paris:20261103T140000',
    'DTEND;TZID=Europe/Paris:20261103T150000',
    'STATUS:CONFIRMED',
    'ORGANIZER:mailto:sarah@example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:malik@example.org',
    'RRULE:FREQ=WEEKLY;BYDAY=TU',
  ]),
  event(['UID:acme-offsite@example.org', 'SUMMARY:Acme offsite', 'DTSTART;VALUE=DATE:20261105']),
  event([
    'UID:sprint-review@example.org',
    'SUMMARY:Sprint review',
    'DTSTART;TZID=Europe/Paris:20261106T140000',
    'DTEND;TZID=Europe/Paris:20261106T150000',
    'STATUS:CANCELLED',
  ]),
  event([
    'UID:focus-time@example.org',
    'SUMMARY:Focus time',
    'DTSTART;TZID=Europe/Paris:20261109T140000',
    'DTEND;TZID=Europe/Paris:20261109T150000',
    'TRANSP:TRANSPARENT',
  ]),
  event([
    'UID:declined-sync@example.org',
    'SUMMARY:Northwind sync',
    'DTSTART;TZID=Europe/Paris:20261110T140000',
    'DTEND;TZID=Europe/Paris:20261110T150000',
    'ORGANIZER:mailto:sarah@example.com',
    'ATTENDEE;PARTSTAT=DECLINED:mailto:sarah@example.com',
  ]),
);

describe('skipReason (HEU-F-03)', () => {
  const events = report(agenda).events;
  const reasonOf = (uid: string): string | null | undefined =>
    skipReason(events.find((meeting) => meeting.uid === uid) ?? events[0]!);

  it('keeps a confirmed meeting with attendees', () => {
    expect(reasonOf('point-hebdo@example.org')).toBeNull();
  });

  it('sets aside all-day events, cancellations, free slots and declined meetings', () => {
    expect(reasonOf('acme-offsite@example.org')).toBe('all-day');
    expect(reasonOf('sprint-review@example.org')).toBe('cancelled');
    expect(reasonOf('focus-time@example.org')).toBe('transparent');
    expect(reasonOf('declined-sync@example.org')).toBe('declined');
  });

  it('keeps a meeting declined by one attendee when others accepted', () => {
    const [meeting] = report(
      calendar(
        event([
          'UID:mixed@example.org',
          'DTSTART:20261103T140000Z',
          'DTEND:20261103T150000Z',
          'ORGANIZER:mailto:sarah@example.com',
          'ATTENDEE;PARTSTAT=DECLINED:mailto:sarah@example.com',
          'ATTENDEE;PARTSTAT=ACCEPTED:mailto:malik@example.org',
        ]),
      ),
    ).events;
    expect(meeting && skipReason(meeting)).toBeNull();
  });
});

describe('toEvidence', () => {
  const evidence = toEvidence(report(agenda).events, { defaultTimeZone: TZ });

  it('keeps only the meetings that prove worked time', () => {
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.title).toBe('Point hebdo');
  });

  it('builds a deterministic calendar evidence row', () => {
    expect(evidence[0]).toEqual({
      id: `ics:point-hebdo@example.org:${at(2026, 11, 3, 13, 0)}`,
      source: 'calendar',
      kind: 'meeting',
      clientId: null,
      start: at(2026, 11, 3, 13, 0),
      end: at(2026, 11, 3, 14, 0),
      title: 'Point hebdo',
      attendees: [{ email: 'malik@example.org', partStat: 'accepted' }],
      organizerEmail: 'sarah@example.com',
      status: 'confirmed',
      allDay: false,
      recurring: true,
      timeZone: TZ,
      raw: evidence[0]?.raw,
    });
  });

  it('is idempotent: re-importing the same file yields the same ids', () => {
    const again = toEvidence(report(agenda).events);
    expect(again.map((item) => item.id)).toEqual(evidence.map((item) => item.id));
  });
});
