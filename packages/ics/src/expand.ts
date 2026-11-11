/**
 * Recurrence expansion (HEU-F-03).
 *
 * Occurrences are generated in civil time and converted to instants one by one,
 * so a 09:00 local meeting stays at 09:00 local across a DST change: the
 * instant moves, the wall clock does not (HEU-P-11). The length of an
 * occurrence is exact, as RFC 5545 §3.8.5.3 prescribes for DATE-TIME values, so
 * the duration is identical in every display zone.
 */

import type { Instant, Period } from '@ghost-hours/core';
import { civilToMs, withTime } from './civil.ts';
import { parseDateValue } from './datetime.ts';
import type { EventClock } from './event-clock.ts';
import { clockInstant, eventClock } from './event-clock.ts';
import type { RecurrenceRule } from './rrule.ts';
import { parseRRule } from './rrule.ts';
import { ruleDates } from './rrule-dates.ts';
import type { IcsEvent } from './types.ts';

export const DEFAULT_EXPANSION_LIMIT = 5_000;

export interface ExpandOptions {
  readonly defaultTimeZone: string;
  readonly limit?: number;
  /** Receives the explicit warnings expansion may raise (limit reached, exotic rule). */
  readonly onWarning?: (message: string) => void;
}

interface Budget {
  readonly limit: number;
  count: number;
  reached: boolean;
}

function warn(options: ExpandOptions, message: string): void {
  options.onWarning?.(message);
}

function inRange(start: Instant, range: Period): boolean {
  return start >= range.start && start < range.end;
}

function makeOccurrence(master: IcsEvent, start: Instant): IcsEvent {
  return { ...master, start, end: start + (master.end - master.start), recurrenceId: null };
}

function untilInstant(rule: RecurrenceRule, clock: EventClock): Instant | null {
  if (rule.until === null) return null;
  const parsed = parseDateValue(rule.until);
  if (!parsed) return null;
  if (parsed.utc) return civilToMs(parsed.civil);
  const civil = parsed.kind === 'date' ? { ...parsed.civil, hour: 23, minute: 59, second: 59 } : parsed.civil;
  return clockInstant(clock, civil);
}

function take(budget: Budget, event: IcsEvent, out: IcsEvent[]): boolean {
  if (budget.count >= budget.limit) {
    budget.reached = true;
    return false;
  }
  budget.count += 1;
  out.push(event);
  return true;
}

function singleOccurrences(master: IcsEvent, range: Period, budget: Budget): IcsEvent[] {
  const excluded = new Set(master.exdates);
  const out: IcsEvent[] = [];
  for (const start of [master.start, ...master.rdates]) {
    if (excluded.has(start) || !inRange(start, range)) continue;
    if (!take(budget, makeOccurrence(master, start), out)) break;
  }
  return out;
}

function ruleOccurrences(
  master: IcsEvent,
  rule: RecurrenceRule,
  clock: EventClock,
  range: Period,
  budget: Budget,
): IcsEvent[] {
  const excluded = new Set(master.exdates);
  const until = untilInstant(rule, clock);
  const out: IcsEvent[] = [];
  let produced = 0;
  for (const date of ruleDates(rule, clock.civil)) {
    if (rule.count !== null && produced >= rule.count) break;
    const start = clockInstant(clock, withTime(date, clock.civil));
    if (until !== null && start > until) break;
    produced += 1;
    if (start >= range.end) break;
    if (start < range.start || excluded.has(start)) continue;
    if (!take(budget, makeOccurrence(master, start), out)) break;
  }
  return out;
}

function expandEvent(master: IcsEvent, range: Period, options: ExpandOptions, budget: Budget): IcsEvent[] {
  const clock = eventClock(master, options.defaultTimeZone);
  if (master.rrule === null) return singleOccurrences(master, range, budget);
  const parsed = parseRRule(master.rrule);
  if (!parsed.ok) {
    warn(options, `event ${master.uid}: ${parsed.errors.join('; ')}; kept as a single occurrence`);
    return singleOccurrences(master, range, budget);
  }
  const occurrences = ruleOccurrences(master, parsed.value, clock, range, budget);
  const known = new Set(occurrences.map((occurrence) => occurrence.start));
  for (const rdate of master.rdates) {
    if (known.has(rdate) || !inRange(rdate, range) || master.exdates.includes(rdate)) continue;
    known.add(rdate);
    if (!take(budget, makeOccurrence(master, rdate), occurrences)) break;
  }
  return occurrences.sort((a, b) => a.start - b.start);
}

function groupByUid(events: readonly IcsEvent[]): Map<string, IcsEvent[]> {
  const groups = new Map<string, IcsEvent[]>();
  for (const event of events) {
    const group = groups.get(event.uid);
    if (group) group.push(event);
    else groups.set(event.uid, [event]);
  }
  return groups;
}

/** Same `uid` and same start is the same meeting (HEU-F-06: no duplicates). */
function dedupeAndSort(events: readonly IcsEvent[]): IcsEvent[] {
  const seen = new Set<string>();
  const unique: IcsEvent[] = [];
  for (const event of events) {
    const key = `${event.uid}\u0000${event.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique.sort((a, b) => a.start - b.start || a.uid.localeCompare(b.uid) || a.end - b.end);
}

export function expandRecurring(
  events: readonly IcsEvent[],
  range: Period,
  options: { readonly defaultTimeZone: string; readonly limit?: number; readonly onWarning?: (message: string) => void },
): IcsEvent[] {
  const limit = Math.max(1, options.limit ?? DEFAULT_EXPANSION_LIMIT);
  const budget: Budget = { limit, count: 0, reached: false };
  const groups = groupByUid(events);
  const out: IcsEvent[] = [];
  for (const uid of [...groups.keys()].sort()) {
    const group = groups.get(uid) ?? [];
    const overrides = group.filter((event) => event.recurrenceId !== null);
    const replaced = new Set(overrides.map((override) => override.recurrenceId));
    for (const master of group.filter((event) => event.recurrenceId === null)) {
      for (const occurrence of expandEvent(master, range, options, budget)) {
        if (!replaced.has(occurrence.start)) out.push(occurrence);
      }
    }
    for (const override of overrides) {
      if (inRange(override.start, range)) out.push(override);
    }
  }
  if (budget.reached) warn(options, `expansion stopped at the ${limit} occurrence limit`);
  return dedupeAndSort(out);
}
