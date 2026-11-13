---
inclusion: fileMatch
fileMatchPattern:
  - "packages/intervals/**"
  - "packages/sessionizer/**"
  - "packages/ics/**"
  - "packages/billing/**"
---

# Ghost Hours — time steering (HEU-N-02)

Every bug that will ever be reported about this product, if any, will be a time bug. Read this
before touching a date.

## The rule

**The domain manipulates instants (epoch milliseconds, UTC) and an explicit IANA time zone
string. Nothing else.**

- An `Instant` is a `number`. It has no time zone and no calendar meaning on its own.
- A wall-clock reading only exists at the edges: when parsing an `.ics` value, when formatting for
  display, when reading `workdayStart: '07:00'` from settings. At those edges the `timeZone` must be
  passed explicitly.
- A duration is `end - start` in milliseconds. It does **not** depend on the display zone.

## Forbidden

| Forbidden | Why | Use instead |
|---|---|---|
| `date.getFullYear()`, `getMonth()`, `getDate()`, `getHours()` | reads the **machine's** zone | `zonedParts(instant, timeZone)` |
| `date.setHours(0,0,0,0)` | same, and silently shifts | `startOfDayInZone(instant, timeZone)` |
| `new Date(y, m, d)` | builds a local-time instant | `zonedTimeToInstant({ year, month, day }, timeZone)` |
| `new Date('2026-11-03T14:05:52')` | parsed as local time when no offset is present | parse with an explicit offset, or `zonedTimeToInstant` |
| `+ 24 * 3600 * 1000` to mean "tomorrow" | wrong on a DST day (23 h or 25 h) | `addDaysInZone(instant, 1, timeZone)` |
| `+ 60 * 60 * 1000` to mean "next hour" | ambiguous in the repeated hour of October | add minutes to the instant, then re-read parts |
| hard-coded `+01:00` / `+02:00` / `3600000` offsets | true half the year | `offsetMinutesAt(instant, timeZone)` |
| `toISOString().slice(0, 10)` as a day key | gives the UTC day, not the local one | `dayKeyInZone(instant, timeZone)` |
| `if (hours === 24)` for "a full day" | a workday is 7 h here, and days vary | `settings.dayLengthMinutes` |
| `Intl.DateTimeFormat` called ad hoc in a package | drifts from the rest | `formatClockInZone`, `formatDate`, `formatTime` |

## Helpers to use (all in `@ghost-hours/core`, all DST-safe and tested)

```ts
zonedParts(instant, tz): ZonedParts        // { year, month, day, hour, minute, second, weekday, offsetMinutes }
zonedTimeToInstant({ year, month, day, hour, minute }, tz): Instant
offsetMinutesAt(instant, tz): number
dayKeyInZone(instant, tz): string          // 'YYYY-MM-DD'
startOfDayInZone(instant, tz): Instant
dayRangeInZone(instant, tz): { dayKey, start, end }   // end is exclusive
addDaysInZone(instant, days, tz): Instant
isSameDayInZone(a, b, tz): boolean
weekStartInZone(instant, tz, weekStartsOn = 1): Instant
weekDaysInZone(instant, tz, weekStartsOn = 1): DayRange[]
monthRangeInZone(year, month, tz): { start, end }
iterDaysInRange(start, end, tz): DayRange[]
formatClockInZone(instant, tz): 'HH:MM'
parseClock('HH:MM'): number | null
spansDstChange(start, end, tz): boolean
MINUTE_MS, HOUR_MS, DAY_MS
```

`DAY_MS` is a *nominal* day (24 h) for arithmetic on durations. Never use it to advance a calendar
day in a zone — that is `addDaysInZone`.

## Intervals are half-open

`[start, end)`. Two blocks that touch (`a.end === b.start`) do **not** overlap. Overlap means
`a.start < b.end && b.start < a.end`. Every function in `packages/intervals` follows this; the
property HEU-P-01 depends on it.

## The two DST days of Europe/Paris

| Day | Local length | Trap |
|---|---|---|
| last Sunday of March | 23 h | 02:00–03:00 does not exist. `zonedTimeToInstant` must resolve a non-existent wall time forward (documented in `core`). A session spanning 01:30 → 03:30 is 1 h, not 2 h. |
| last Sunday of October | 25 h | 02:00–03:00 happens twice. A commit at "02:30" needs its offset to be unambiguous; store the instant, never the wall clock. |

Also: a client in another zone (`Asia/Tokyo`) with a `Europe/Paris` workday. Sessions are cut by
`gapMax` **on instants**, so zone does not change the cut; only display and `workdayStart`
clamping use a zone.

## Before / after

```ts
// BEFORE — wrong on DST days and on any machine not set to Europe/Paris
const dayStart = new Date(block.start);
dayStart.setHours(0, 0, 0, 0);
const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
const key = new Date(block.start).toISOString().slice(0, 10);

// AFTER
const { start, end, dayKey } = dayRangeInZone(block.start, settings.timeZone);
```

```ts
// BEFORE — assumes the lead-in never crosses a day boundary
const leadStart = firstCommit.at - leadInMinutes * 60_000;
if (new Date(leadStart).getHours() < 7) leadStart = /* … */;

// AFTER — clamp on instants, compare with the workday start in the client's zone
const workdayStart = zonedTimeToInstant(
  { ...zonedParts(firstCommit.at, tz), hour: 7, minute: 0, second: 0 },
  tz,
);
const leadStart = clampInstant(firstCommit.at - minutesToMs(leadIn), workdayStart, firstCommit.at);
```

## Checklist for any time-touching change

1. No `getFullYear` / `getMonth` / `getDate` / `getHours` / `setHours` / `new Date(y,m,d)` in the diff.
2. No literal offset (`+01:00`, `3600000`, `7200000`) outside `core`.
3. Every function that reads a calendar field takes a `timeZone` parameter.
4. A test covers a DST day (23 h and 25 h) and a midnight boundary.
5. HEU-P-11 (duration independent of display zone) and HEU-P-12 (recurrence occurrences) still pass.
6. Ask the `time-reviewer` agent to re-read the diff.
