import type { Evidence } from '@ghost-hours/core';
import { addDaysInZone, dayRangeInZone } from '@ghost-hours/core';
import { expandRecurring, parseIcs, toEvidence } from '@ghost-hours/ics';

/**
 * One place turns an `.ics` text into evidence (HEU-F-02, HEU-F-03).
 *
 * Recurrences are expanded before the events become evidence: a weekly meeting
 * is one line in the file and four or five blocks on the screen. The expansion
 * window is derived from the file itself — from its earliest event to a year
 * later — so a monthly export keeps every occurrence it describes, and a
 * rule with no `UNTIL` and no `COUNT` stops at the reader's own limit, which
 * is reported instead of hidden.
 */

export const EXPANSION_DAYS = 400;
export const EXPANSION_LIMIT = 5000;

export interface CalendarImport {
  readonly evidence: readonly Evidence[];
  readonly report: readonly string[];
}

export function calendarEvidence(ics: string, timeZone: string): CalendarImport {
  const parsed = parseIcs(ics, { defaultTimeZone: timeZone });
  if (!parsed.ok) return { evidence: [], report: parsed.errors };
  const events = parsed.value.events;
  const report = [...parsed.value.warnings, ...parsed.value.skipped.map((item) => `skipped: ${item.reason}`)];
  if (events.length === 0) return { evidence: [], report };

  const starts = events.map((event) => event.start);
  const from = Math.min(...starts);
  const to = addDaysInZone(from, EXPANSION_DAYS, timeZone);
  const expanded = expandRecurring(events, { start: dayRangeInZone(from, timeZone).start, end: to }, {
    defaultTimeZone: timeZone,
    limit: EXPANSION_LIMIT,
  });
  const evidence = toEvidence(expanded, { defaultTimeZone: timeZone });
  return {
    evidence,
    report: [...report, `calendar: ${events.length} events → ${evidence.length} occurrences`],
  };
}
