# Design — `ics-import`

## 1. Position

```
.ics file ──▶ ics: unfold → tokenise → build VEVENTs → resolve zones → expand recurrences
                     │                                              │
                     └── parse errors, exclusion counts ────────────┴──▶ Evidence[] (source: 'calendar')
```

Output is `Evidence[]` with `source: 'calendar'`, `kind: 'meeting'`, `start`/`end` in epoch ms,
`timeZone` the event's own zone, `attendees` normalised, and the untouched block in `raw`. The
package knows nothing about clients, blocks or billing.

## 2. Components

| Module | Responsibility |
|---|---|
| `unfold.ts` | RFC 5545 line unfolding, `\n` and `\r\n`, continuation by space/tab |
| `lexer.ts` | split `NAME;PARAM=VAL;…:VALUE` into `{ name, params, value }` |
| `parse.ts` | walk `BEGIN/END` blocks, build `RawEvent` records, collect the calendar-level defaults |
| `datetime.ts` | `parseIcsInstant(value, params, defaultZone)` → `Instant`; `parseIcsDuration('PT1H30M')` |
| `expand.ts` | `RRULE`/`RDATE`/`EXDATE`/`RECURRENCE-ID` expansion inside a period |
| `filter.ts` | the exclusion rules of Requirement 4, with a reason |
| `import.ts` | orchestration: `importIcs(text, period, options)` → `IcsImportResult` |
| `index.ts` | barrel |

`expand.ts` is the only module over 150 lines; if it grows past 250 it splits into `rrule.ts`
(parsing) and `occurrences.ts` (generation).

## 3. Signatures

```ts
interface IcsImportOptions {
  timeZone: string;            // the user's zone, used for floating values and fallback
  attendeeEmail: string;       // whose partStat matters for the `declined` rule
  maxOccurrences?: number;     // default 10_000
  now?: Instant;               // injected for determinism in tests
}

interface ExclusionCounts {
  allDay: number; cancelled: number; declined: number; transparent: number;
  notMine: number; outOfPeriod: number;
}

interface IcsImportResult {
  evidence: Evidence[];
  excluded: ExclusionCounts;
  warnings: readonly string[];      // partially read rules, unknown TZID, cap reached
  eventsRead: number;
}

export function importIcs(
  text: string, period: Period, options: IcsImportOptions,
): ParseResult<IcsImportResult>;

// internals, exported for tests
export function unfold(text: string): string;
export function parseContentLine(line: string): ContentLine | null;
export function parseIcsInstant(value: string, params: Record<string, string>, defaultZone: string): Instant | null;
export function parseIcsDuration(value: string): number | null;     // ms
export function expandOccurrences(
  event: RawEvent, period: Period, max: number,
): { starts: Instant[]; warnings: string[] };
```

`ParseResult` is core's `{ ok: true, value } | { ok: false, errors }`; an invalid file is a value,
not an exception.

## 4. Parsing rules that matter

| Rule | Why |
|---|---|
| unfold before anything else | a long `DESCRIPTION` or `RRULE` is folded; parsing first gives garbage |
| unescape `\,` `\;` `\n` `\\` in text values | a summary containing a comma is common |
| property names are case-insensitive, values are not | `DTSTART` / `dtstart` both occur |
| `DTEND` is exclusive | an 11:00–11:30 meeting ends at 11:30, and `end` is 11:30 in our half-open model |
| `DURATION` is an alternative to `DTEND`, never both | if both, `DTEND` wins and a warning is emitted |
| `VALUE=DATE` → all-day, excluded | Requirement 4.1 |
| a `VTIMEZONE` block is skipped | we use the IANA database; the embedded rules are a trap |
| unknown `TZID` → user's zone + warning | never guess an offset |

## 5. Recurrence expansion

```ts
// expandOccurrences, in order
1. starts = [DTSTART]
2. if RRULE: generate candidates from DTSTART, stepping in the event's own zone
   - DAILY  : addDaysInZone(cursor, interval, tz)
   - WEEKLY : weekStartInZone + BYDAY offsets, step by interval weeks
   - MONTHLY: same day-of-month via zonedTimeToInstant, skip months without it
   - stop at COUNT, at UNTIL, at period.end, or at max (whichever first)
3. add RDATE values
4. remove EXDATE values (by exact instant, after zone resolution)
5. remove any occurrence whose RECURRENCE-ID appears in a modified VEVENT
6. sort ascending, drop duplicates by start
7. keep only occurrences intersecting [period.start, period.end)
```

Two subtleties that are the whole reason for HEU-P-12:

- **Stepping must be calendar-based, not millisecond-based.** A weekly meeting at 10:00 Paris stays
  at 10:00 across the DST change, which means the instant moves by one hour. `addDaysInZone` and
  `zonedTimeToInstant` from core do this; `+ 7 * DAY_MS` does not.
- **`UNTIL` is compared on instants**, after resolving its own zone, not on wall-clock strings.

A non-existent wall time (02:30 on the spring-forward day) resolves forward per core's documented
rule; the occurrence is kept and a warning is added. A duplicated wall time (02:30 in October)
resolves to the first occurrence, which is what calendar clients do.

## 6. Errors and reporting

| Situation | Result |
|---|---|
| no `BEGIN:VCALENDAR` | `err('not an iCalendar file')` |
| unclosed block | `err('unterminated VEVENT at line N')` |
| event without `DTSTART` | skipped, warning, counted in `eventsRead` only |
| unsupported `RRULE` part | occurrence list from the supported parts + warning naming the part |
| `TZID` unknown | user's zone, `raw.unknownTimeZone: true`, warning |
| expansion cap reached | warning with the `UID`; the app shows it |
| duplicate `UID` + `RECURRENCE-ID` collision | last one wins, warning |

Every warning is a short English sentence containing the event `UID`, never the summary (summaries
can be confidential).

## 7. Properties to test

| Property | Test file | Shape |
|---|---|---|
| **HEU-P-12** | `expand.test.ts` | generated weekly rule + generated period: all occurrences intersect the period, no duplicate starts, no `EXDATE` present |
| **HEU-P-11** | `datetime.test.ts` | generated event + two zones: `duration` identical; also a fixed 25 October 2026 case |
| round trip | `parse.test.ts` | `importIcs` then `serializeEvidenceFile` then `parseEvidenceFile` keeps start/end |
| totals | `parse.test.ts` | `eventsRead === evidence.length + sum(excluded)` |

Generators:

```ts
export const arbWeekly = fc.record({
  start: arbInstantOnGrid(),              // on the hour, Europe/Paris
  interval: fc.integer({ min: 1, max: 4 }),
  count: fc.integer({ min: 1, max: 30 }),
  byDay: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 3 }),
});
export const arbPeriod = fc.tuple(arbInstant, fc.integer({ min: 1, max: 90 }))
  .map(([start, days]) => ({ start, end: start + days * DAY_MS }));
```

## 8. Test fixtures

`packages/ics/src/__fixtures__/` is **not** used (tests live next to sources). Fixtures are inline
template strings inside the `.test.ts` files, plus one shared `fixtures.ts` module exporting
`minimalCalendar`, `weeklyCalendar`, `dstCalendar`. All names are fictitious:

```
ATTENDEE;PARTSTAT=ACCEPTED:mailto:sofia@example.com
ORGANIZER:mailto:malik@example.org
SUMMARY:Weekly sync — Acme
```

Never paste a real calendar export into a test. `.kiroignore` and `.gitignore` both exclude `*.ics`
outside `fixtures/` for exactly this reason.

## 9. Boundaries

| Consumer | Uses |
|---|---|
| `mapping` | `Evidence.attendees[].email`, `organizerEmail`, `title` for rules |
| `sessionizer` | `start`/`end` of `kind: 'meeting'` evidence, as exact blocks |
| `apps/web` | the `IcsImportResult` warnings and counts, shown in the import screen |

The package does not decide which meetings are billable, does not assign a client, and does not
create blocks.
