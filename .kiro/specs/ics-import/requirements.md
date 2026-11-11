# Requirements — `ics-import`

Feature: read an iCalendar (`.ics`) export, expand recurrences, respect each event's time zone
(cahier D.4, D.10, module `ics`). Owner package: `packages/ics`.
Covers **HEU-F-02**, **HEU-F-03** and properties **HEU-P-11**, **HEU-P-12**.
Path chosen: **requirements first** — the failure mode here is silent (a meeting disappears, a
recurring stand-up doubles), so the requirements are written before the parser.

## Introduction

Malik's half-day is meetings. Git sees none of it. The `.ics` file is the only source that knows a
meeting started at 11:00 and ended at 11:30, and it is the only source that comes with a time zone
the user did not choose.

Scope boundaries:

- **In**: a **subset** of RFC 5545 — `VCALENDAR`, `VEVENT`, `UID`, `DTSTART`, `DTEND`,
  `DURATION`, `SUMMARY`, `ATTENDEE`, `ORGANIZER`, `STATUS`, `TRANSP`, `RRULE`, `RDATE`, `EXDATE`,
  `RECURRENCE-ID`; line folding; `TZID` resolution; recurrence expansion inside a period.
- **Out**: `VTODO`, `VJOURNAL`, `VFREEBUSY`, `VALARM`, attachments, `VTIMEZONE` custom offset rules
  (we resolve `TZID` through the IANA database, not through the embedded definition), CalDAV,
  invitations, RSVP.

Out-of-scope data is **skipped and counted**, never silently dropped: an unreadable event must appear
in a list the user can see (D.15).

---

## Requirements

### Requirement 1 — HEU-F-02 (I): extract the events of the requested period

**User Story:** As Malik, I want to drop my calendar export into the app and get the meetings of the
month I am reviewing, so that the meetings I attended count as work.

#### Acceptance Criteria

1. WHEN the user provides a `.ics` file and a period, THE SYSTEM SHALL parse the file and return the
   events that intersect the period.
2. WHEN an event has `DTSTART` and `DTEND`, THE SYSTEM SHALL use them as the event's span.
3. WHEN an event has `DTSTART` and `DURATION` but no `DTEND`, THE SYSTEM SHALL compute the end from
   the duration.
4. WHEN an event has `DTSTART` and neither `DTEND` nor `DURATION`, THE SYSTEM SHALL use the RFC 5545
   default (the event ends when it starts) and mark it zero-length.
5. WHEN a line is folded (continuation lines beginning with a space or a tab), THE SYSTEM SHALL
   unfold it before parsing.
6. WHEN the file is not valid iCalendar, THE SYSTEM SHALL return an error result listing the reason,
   not throw.
7. THE SYSTEM SHALL preserve the raw block of each event in `Evidence.raw` for later inspection.

#### Scenario: one meeting in November

- **GIVEN** an `.ics` with `SUMMARY:Weekly sync`, `DTSTART;TZID=Europe/Paris:20261105T110000`,
  `DTEND;TZID=Europe/Paris:20261105T113000`
- **WHEN** the file is imported for the period 1–30 November 2026
- **THEN** exactly one event is returned, starting at 10:00 UTC and ending at 10:30 UTC
- **AND** its `timeZone` is `Europe/Paris` and its `status` is `confirmed`

#### Scenario: a folded summary

- **GIVEN** a `SUMMARY` split across two lines, the second starting with a single space
- **WHEN** the file is parsed
- **THEN** the title is the concatenation of both parts, without the folding space

### Requirement 2 — HEU-F-03 (I): expand recurrences, honour exceptions

**User Story:** As Malik, I want my recurring stand-up to appear on every Tuesday it actually
happened, so that I do not have to add eleven meetings by hand.

#### Acceptance Criteria

1. WHEN an event carries an `RRULE`, THE SYSTEM SHALL expand it into occurrences inside the
   requested period only — never outside it.
2. THE SYSTEM SHALL support at least `FREQ=DAILY|WEEKLY|MONTHLY`, `INTERVAL`, `COUNT`, `UNTIL`,
   `BYDAY`, `BYMONTHDAY`.
3. WHEN an occurrence is listed in `EXDATE`, THE SYSTEM SHALL exclude it.
4. WHEN an extra occurrence is listed in `RDATE`, THE SYSTEM SHALL include it.
5. WHEN a modified occurrence carries a `RECURRENCE-ID`, THE SYSTEM SHALL replace the occurrence with
   that id by the modified one, without creating a duplicate.
6. WHEN an `RRULE` uses an unsupported part, THE SYSTEM SHALL expand what it understands and report
   the event in the "partially read" list.
7. THE SYSTEM SHALL cap expansion (default 10 000 occurrences per event) and report when the cap is
   hit, so a pathological rule cannot hang the app.
8. THE SYSTEM SHALL NOT return the same occurrence twice.

#### Scenario: weekly stand-up with one cancelled occurrence

- **GIVEN** `RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4` starting Tuesday 3 November 2026, and
  `EXDATE:20261117T100000Z`
- **WHEN** the file is imported for November 2026
- **THEN** three occurrences are returned (3, 10, 24 November)
- **AND** none falls on 17 November

#### Scenario: occurrence moved by RECURRENCE-ID

- **GIVEN** a weekly rule and a `VEVENT` with `RECURRENCE-ID` on 10 November at 15:00 instead of 10:00
- **WHEN** the file is imported
- **THEN** the occurrence of 10 November starts at 15:00
- **AND** the total count is unchanged

### Requirement 3 — HEU-F-03 (I): each event keeps its own time zone

**User Story:** As Sofia, who has one client in Tokyo, I want a meeting at 09:00 Tokyo time to land
at the right instant in my Paris week, so that my blocks do not shift by eight hours.

#### Acceptance Criteria

1. WHEN an event carries `DTSTART;TZID=<zone>`, THE SYSTEM SHALL resolve the wall time in that zone
   using the IANA database, via `zonedTimeToInstant` from core.
2. WHEN an event carries a UTC value (suffix `Z`), THE SYSTEM SHALL use it as-is.
3. WHEN an event carries a floating value (no `TZID`, no `Z`), THE SYSTEM SHALL interpret it in the
   calendar's default zone (`X-WR-TIMEZONE` when present, else the user's zone) and mark
   `raw.floating: true`.
4. WHEN an event carries `VALUE=DATE` (an all-day event), THE SYSTEM SHALL NOT convert it with a
   zone; it is excluded from blocks anyway (see Requirement 4).
5. WHEN a `TZID` is unknown to the runtime, THE SYSTEM SHALL fall back to the user's zone, mark the
   event `raw.unknownTimeZone: true`, and list it in the report.
6. THE SYSTEM SHALL NOT apply a hard-coded offset anywhere.

#### Scenario: Tokyo meeting in a Paris week

- **GIVEN** `DTSTART;TZID=Asia/Tokyo:20261110T090000` with a 60-minute duration
- **WHEN** the file is imported
- **THEN** the event starts at 00:00 UTC and ends at 01:00 UTC
- **AND** it appears on 10 November in the Paris week view

#### Scenario: meeting across the autumn DST change

- **GIVEN** a meeting on 25 October 2026 from 01:30 to 03:30 Paris time
- **WHEN** the file is imported
- **THEN** its duration is 3 h (the 02:00–03:00 hour happens twice)
- **AND** the same duration is reported whatever the display zone (HEU-P-11)

### Requirement 4 — HEU-F-03 (I): excluded event kinds

**User Story:** As Malik, I do not want my all-day "holiday" markers or the meetings I declined to
count as work, so that my timesheet is not padded with things I did not do.

#### Acceptance Criteria

1. WHEN an event is all-day (`VALUE=DATE` or a span of at least 24 h with no time), THE SYSTEM SHALL
   exclude it and count it in the report as `allDay`.
2. WHEN an event's `STATUS` is `CANCELLED`, THE SYSTEM SHALL exclude it.
3. WHEN the user's `PARTSTAT` is `DECLINED`, THE SYSTEM SHALL exclude it.
4. WHEN the event's `TRANSP` is `TRANSPARENT` ("show me as available"), THE SYSTEM SHALL exclude it.
5. WHEN the user is not among the attendees and is not the organizer, THE SYSTEM SHALL keep the event
   but mark it `raw.notMine: true`; it is excluded from blocks unless a rule claims it.
6. THE SYSTEM SHALL count every exclusion by reason and expose the counts.
7. WHEN an event is excluded, THE SYSTEM SHALL NOT silently forget it: it appears in the import
   report.

#### Scenario: declined meeting

- **GIVEN** an event with `ATTENDEE;PARTSTAT=DECLINED:mailto:malik@example.org`
- **WHEN** the user is `malik@example.org`
- **THEN** the event is excluded with reason `declined`
- **AND** the report says `1 declined`

#### Scenario: all-day marker

- **GIVEN** `DTSTART;VALUE=DATE:20261111` with no `DTEND`
- **WHEN** the file is imported
- **THEN** the event is excluded with reason `allDay`

### Requirement 5 — HEU-P-12 (I): occurrences are inside the period, unique, exceptions applied

**User Story:** As a developer, I want a property that states the recurrence contract, so that a
regression in the expansion is caught by a generated case rather than by Sofia noticing a missing
meeting.

#### Acceptance Criteria

1. WHEN expansion runs for a period `[start, end)`, THE SYSTEM SHALL return only occurrences that
   intersect that period.
2. THE SYSTEM SHALL NOT return two occurrences with the same start instant for the same `UID`.
3. WHEN an occurrence is in `EXDATE`, THE SYSTEM SHALL NOT return it.
4. THE SYSTEM SHALL preserve the event's duration across occurrences unless the `RRULE` says
   otherwise.

#### Scenario: property holds on generated rules

- **GIVEN** a generated event with a random weekly rule and a random period
- **WHEN** the expansion is computed
- **THEN** every returned occurrence intersects the period
- **AND** the set of start instants has no duplicate
- **AND** no start instant equals an `EXDATE`

### Requirement 6 — HEU-N-02 (I): durations are zone-independent

**User Story:** As Sofia, I want a meeting to last the same number of minutes whether I look at it in
Paris or in Tokyo, so that my totals do not change with a display setting.

#### Acceptance Criteria

1. WHEN an event's duration is computed, THE SYSTEM SHALL compute `end - start` on instants.
2. THE SYSTEM SHALL NOT recompute a duration from wall-clock parts.
3. WHEN an event spans a DST change, THE SYSTEM SHALL return the real elapsed duration (23 h or 25 h
   days included).

#### Scenario: 25 October, 01:30 to 03:30 Paris

- **GIVEN** the event of Requirement 3
- **WHEN** the duration is computed in `Europe/Paris` and in `Asia/Tokyo`
- **THEN** both give the same number of milliseconds (HEU-P-11)

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-01 | no network: no fetching of a calendar, no `TZID` lookup over HTTP; IANA data comes from the runtime |
| HEU-N-02 | instants only; a zone is used at parse time and at display time, never in between |
| HEU-N-06 | every fixture `.ics` is fictitious (`example.com`, Acme/Northwind/Globex) |
| — | a 2 000-event calendar parses in under 300 ms (`TODO(measure)` until measured) |

## Properties owned by this spec

- **HEU-P-11** — a block's duration is the same in any display zone, DST days included.
- **HEU-P-12** — the occurrences of a recurring event are all inside the requested period, without
  duplicates, with exceptions excluded.
