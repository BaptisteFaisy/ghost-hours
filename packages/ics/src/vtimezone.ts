/**
 * `VTIMEZONE` support for `TZID`s that are not IANA identifiers (RFC 5545
 * §3.6.5). Observances are expanded with the same civil engine as events, so a
 * `FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU` rule behaves like Europe/Paris.
 */

import type { CivilDateTime } from './civil.ts';
import { civilToMs, dayNumber, withTime } from './civil.ts';
import type { RawComponent } from './components.ts';
import { parseDateValue, parseUtcOffset } from './datetime.ts';
import { firstValue } from './props.ts';
import type { RecurrenceRule } from './rrule.ts';
import { parseRRule } from './rrule.ts';
import { ruleDates } from './rrule-dates.ts';

export interface Observance {
  /** Local reading of the transition, in the *previous* offset. */
  readonly onset: CivilDateTime;
  readonly offsetFrom: number;
  readonly offsetTo: number;
  readonly rule: RecurrenceRule | null;
}

export interface VTimezone {
  readonly tzid: string;
  readonly observances: readonly Observance[];
}

export interface VTimezoneResult {
  readonly timeZone?: VTimezone;
  readonly warnings: readonly string[];
}

function buildObservance(child: RawComponent, tzid: string, warnings: string[]): Observance | null {
  const startValue = firstValue(child, 'DTSTART');
  const onset = startValue === undefined ? null : parseDateValue(startValue);
  const offsetFrom = parseUtcOffset(firstValue(child, 'TZOFFSETFROM') ?? '');
  const offsetTo = parseUtcOffset(firstValue(child, 'TZOFFSETTO') ?? '');
  if (!onset || offsetFrom === null || offsetTo === null) {
    warnings.push(`VTIMEZONE ${tzid}: incomplete ${child.name} observance ignored`);
    return null;
  }
  const rruleValue = firstValue(child, 'RRULE');
  let rule: RecurrenceRule | null = null;
  if (rruleValue !== undefined) {
    const parsed = parseRRule(rruleValue);
    if (parsed.ok) rule = parsed.value;
    else warnings.push(`VTIMEZONE ${tzid}: ${parsed.errors.join('; ')}`);
  }
  return { onset: onset.civil, offsetFrom, offsetTo, rule };
}

export function parseVTimezone(component: RawComponent): VTimezoneResult {
  const warnings: string[] = [];
  const tzid = (firstValue(component, 'TZID') ?? '').trim();
  if (tzid === '') return { warnings: ['VTIMEZONE without TZID is ignored'] };
  const observances: Observance[] = [];
  for (const child of component.children) {
    if (child.name !== 'STANDARD' && child.name !== 'DAYLIGHT') continue;
    const observance = buildObservance(child, tzid, warnings);
    if (observance) observances.push(observance);
  }
  if (observances.length === 0) return { warnings: [...warnings, `VTIMEZONE ${tzid} has no usable observance`] };
  return { timeZone: { tzid, observances }, warnings };
}

interface Onset {
  readonly at: number;
  readonly offsetTo: number;
  readonly offsetFrom: number;
}

function onsetsAround(observance: Observance, year: number): Onset[] {
  const from = dayNumber({ year: year - 1, month: 1, day: 1 });
  const to = dayNumber({ year: year + 1, month: 12, day: 31 });
  const onsets: Onset[] = [observance.onset].map((onset) => ({
    at: civilToMs(onset),
    offsetTo: observance.offsetTo,
    offsetFrom: observance.offsetFrom,
  }));
  if (!observance.rule) return onsets;
  for (const date of ruleDates(observance.rule, observance.onset)) {
    const day = dayNumber(date);
    if (day < from) continue;
    if (day > to) break;
    onsets.push({ at: civilToMs(withTime(date, observance.onset)), offsetTo: observance.offsetTo, offsetFrom: observance.offsetFrom });
  }
  return onsets;
}

/** Offset in minutes east of UTC that `timeZone` applies to a local reading. */
export function offsetMinutesIn(timeZone: VTimezone, civil: CivilDateTime): number {
  const target = civilToMs(civil);
  const onsets = timeZone.observances.flatMap((observance) => onsetsAround(observance, civil.year));
  let best: Onset | null = null;
  let earliest: Onset | null = null;
  for (const onset of onsets) {
    if (earliest === null || onset.at < earliest.at) earliest = onset;
    if (onset.at <= target && (best === null || onset.at > best.at)) best = onset;
  }
  if (best) return best.offsetTo;
  return earliest === null ? 0 : earliest.offsetFrom;
}
