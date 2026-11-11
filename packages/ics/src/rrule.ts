/**
 * A deliberately small subset of RFC 5545 §3.3.10 recurrence rules.
 *
 * Supported: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
 * BYDAY (with ordinals for MONTHLY/YEARLY), BYMONTHDAY, BYMONTH, WKST.
 * Anything else is reported through `approximations` so the caller can raise a
 * warning instead of silently pretending the rule was understood (risk D.15).
 */

import { err, ok } from '@ghost-hours/core';
import type { ParseResult } from '@ghost-hours/core';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ByDaySpec {
  /** 1 = Monday … 7 = Sunday. */
  readonly weekday: number;
  /** `2MO` → 2, `-1FR` → -1, plain `MO` → null. */
  readonly ordinal: number | null;
}

export interface RecurrenceRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly count: number | null;
  /** Raw `UNTIL` value, resolved against a zone by the caller. */
  readonly until: string | null;
  readonly byDay: readonly ByDaySpec[];
  readonly byMonthDay: readonly number[];
  readonly byMonth: readonly number[];
  /** Week start, 1 = Monday … 7 = Sunday. */
  readonly wkst: number;
  readonly approximations: readonly string[];
}

const WEEKDAYS: Readonly<Record<string, number>> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const FREQUENCIES: readonly Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** Parts understood here; everything else is reported as an approximation. */
const SUPPORTED = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);
const IGNORED = new Set(['BYSETPOS', 'BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYSECOND']);

function parseByDay(raw: string, approximations: string[]): ByDaySpec[] {
  const specs: ByDaySpec[] = [];
  for (const chunk of raw.split(',')) {
    const match = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(chunk.trim());
    if (!match) {
      approximations.push(`BYDAY value "${chunk}" is not understood and is ignored`);
      continue;
    }
    const weekday = WEEKDAYS[(match[2] ?? '').toUpperCase()] ?? 1;
    const ordinal = match[1] === undefined ? null : Number(match[1]);
    specs.push({ weekday, ordinal: ordinal === 0 ? null : ordinal });
  }
  return specs;
}

function parseIntegers(raw: string, approximations: string[], name: string, allowNegative: boolean): number[] {
  const values: number[] = [];
  for (const chunk of raw.split(',')) {
    const number = Number(chunk.trim());
    if (!Number.isInteger(number) || number === 0 || (!allowNegative && number < 0)) {
      approximations.push(`${name} value "${chunk}" is not understood and is ignored`);
      continue;
    }
    values.push(number);
  }
  return values;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const number = Number(raw);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function parseRRule(value: string): ParseResult<RecurrenceRule> {
  const approximations: string[] = [];
  const parts = new Map<string, string>();
  for (const chunk of value.trim().split(';')) {
    const equals = chunk.indexOf('=');
    if (equals < 0) {
      approximations.push(`RRULE part "${chunk}" has no value and is ignored`);
      continue;
    }
    parts.set(chunk.slice(0, equals).trim().toUpperCase(), chunk.slice(equals + 1).trim());
  }
  const freqRaw = (parts.get('FREQ') ?? '').toUpperCase();
  const freq = FREQUENCIES.find((candidate) => candidate === freqRaw);
  if (!freq) return err(`unsupported RRULE frequency "${freqRaw || 'missing'}"`);
  for (const key of parts.keys()) {
    if (SUPPORTED.has(key)) continue;
    approximations.push(
      IGNORED.has(key)
        ? `${key} is not supported; the rule is expanded as a plain ${freq} recurrence`
        : `unknown RRULE part ${key} is ignored`,
    );
  }
  const byDay = parts.has('BYDAY') ? parseByDay(parts.get('BYDAY') ?? '', approximations) : [];
  const byMonth = parts.has('BYMONTH') ? parseIntegers(parts.get('BYMONTH') ?? '', approximations, 'BYMONTH', false) : [];
  const byMonthDay = parts.has('BYMONTHDAY')
    ? parseIntegers(parts.get('BYMONTHDAY') ?? '', approximations, 'BYMONTHDAY', true)
    : [];
  if (freq === 'YEARLY' && byDay.length > 0 && byMonth.length === 0) {
    approximations.push('YEARLY with BYDAY but no BYMONTH is applied to the month of DTSTART');
  }
  const countRaw = parts.get('COUNT');
  return ok({
    freq,
    interval: positiveInteger(parts.get('INTERVAL'), 1),
    count: countRaw === undefined ? null : positiveInteger(countRaw, 1),
    until: parts.get('UNTIL') ?? null,
    byDay,
    byMonthDay,
    byMonth,
    wkst: WEEKDAYS[(parts.get('WKST') ?? 'MO').toUpperCase()] ?? 1,
    approximations,
  });
}
