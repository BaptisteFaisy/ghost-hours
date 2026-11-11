# Tasks — `ics-import`

Ordered by dependency. Each task is verifiable by a test or a command. Tick only what has run green.

## 1. Skeleton and fixtures

- [ ] 1.1 Barrel `packages/ics/src/index.ts` exporting `import`, `unfold`, `lexer`, `datetime`,
      `expand`, `filter` modules (one line each). Verify: `pnpm tsc --noEmit -p packages/ics/tsconfig.json`.
- [ ] 1.2 `fixtures.ts`: `minimalCalendar`, `weeklyCalendar`, `dstCalendar`, `tokyoCalendar`,
      `allDayCalendar` — inline template strings, fictitious names only.
      Verify: `grep -E '@(?!example\.)' fixtures.ts` finds nothing outside the allowed domains.
- [ ] 1.3 `arbitraries.ts`: `arbWeekly`, `arbPeriod`, `arbIcsDate` (fixed seeds later).

## 2. Unfolding and lexing

- [ ] 2.1 `unfold.ts`: join continuation lines, handle `\r\n` and `\n`, leave `BEGIN`/`END` alone.
      Verify: `unfold.test.ts` with a folded `SUMMARY` and a folded `RRULE`.
- [ ] 2.2 `lexer.ts`: `parseContentLine` → `{ name, params, value }`, case-insensitive name,
      quoted parameter values, escaped commas in params. Verify: `lexer.test.ts`.
- [ ] 2.3 Test a value containing `:` (a URL) is not split twice.

## 3. Dates and durations (zone work, do this before expansion)

- [ ] 3.1 `datetime.ts`: `parseIcsInstant` for the three shapes — `…Z` (UTC), `TZID=…` (zone), and
      floating (default zone) — using `zonedTimeToInstant` from core. Never a literal offset.
      Verify: `datetime.test.ts`.
- [ ] 3.2 `parseIcsDuration` for `PT1H30M`, `P1D`, `PT45M`. Verify: unit tests including `PT0S`.
- [ ] 3.3 Property **HEU-P-11**: `it('HEU-P-11 duration does not depend on the display zone')` —
      generated event, compute duration in `Europe/Paris` and `Asia/Tokyo`, assert equality,
      `{ seed: 20261111 }`. Verify: test green.
- [ ] 3.4 Fixed DST cases: 25 October 2026 01:30→03:30 is 3 h; 29 March 2026 01:30→03:30 is 1 h.
      Verify: both assertions in `datetime.test.ts`.

## 4. Event parsing

- [ ] 4.1 `parse.ts`: walk `BEGIN/END`, build `RawEvent` (uid, start, end, duration, summary,
      attendees, organizer, status, transp, rrule, rdates, exdates, recurrenceId, raw block),
      calendar-level `X-WR-TIMEZONE`. Verify: `parse.test.ts` on `minimalCalendar`.
- [ ] 4.2 Handle `DTEND` vs `DURATION` precedence and the zero-length default, with a warning when
      both are present. Verify: three tests.
- [ ] 4.3 Preserve the raw block in `Evidence.raw` verbatim.

## 5. Filtering

- [ ] 5.1 `filter.ts`: reasons `allDay`, `cancelled`, `declined`, `transparent`, `notMine`,
      `outOfPeriod`; return `{ kept, counts }`. Verify: `filter.test.ts`, one test per reason.
- [ ] 5.2 Test that `eventsRead === kept.length + sum(counts)` on the fixture calendars.

## 6. Recurrence expansion

- [ ] 6.1 `expand.ts`: parse `RRULE` into `{ freq, interval, count, until, byDay, byMonthDay }`,
      reject unknown parts into `warnings`. Verify: `rrule.test.ts`.
- [ ] 6.2 Generate occurrences **calendar-based** (`addDaysInZone`, `weekStartInZone`), never by
      adding `DAY_MS`. Verify: a weekly 10:00 Paris rule crossing 25 October keeps 10:00 local.
- [ ] 6.3 Apply `RDATE`, `EXDATE`, `RECURRENCE-ID`; dedupe by start instant; sort ascending.
      Verify: `expand.test.ts`.
- [ ] 6.4 Honour `maxOccurrences` and emit a warning when hit. Verify: a `FREQ=DAILY` with no
      `COUNT`/`UNTIL` and a one-year period stops at the cap.
- [ ] 6.5 Property **HEU-P-12**: `it('HEU-P-12 occurrences are in period, unique, exceptions
      applied')` with `{ seed: 20261112, numRuns: 200 }`. Verify: test green.

## 7. Orchestration

- [ ] 7.1 `import.ts`: `importIcs(text, period, options)` → `ParseResult<IcsImportResult>`,
      mapping kept events to `Evidence` with `source: 'calendar'`, `kind: 'meeting'`,
      `timeZone`, `attendees`, `status`.
      Verify: `import.test.ts` against `weeklyCalendar` for November 2026 → 4 occurrences.
- [ ] 7.2 Invalid input returns `err(...)` with a message naming the line; test three malformed
      files (no VCALENDAR, unclosed VEVENT, garbage).
- [ ] 7.3 Warnings contain the `UID` and never the summary. Verify: assertion on the warning text.

## 8. Finish

- [ ] 8.1 `grep -rn '3600000\|7200000\|+01:00\|+02:00' packages/ics/src` returns nothing.
      Verify: grep output pasted in the task notes.
- [ ] 8.2 `pnpm vitest run packages/ics && pnpm lint && pnpm typecheck` green.
- [ ] 8.3 Parse a 2 000-event generated calendar and record the duration in `KIRO_JOURNAL.md`
      (target under 300 ms). Until measured: `TODO(measure)`.
