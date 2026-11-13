/** RFC 5545 §3.3.4 (DATE / DATE-TIME), §3.3.6 (DURATION), §3.3.14 (UTC-OFFSET). */

import type { CivilDateTime } from './civil.ts';
import { daysInMonth } from './civil.ts';

export interface DateValue {
  /** `date` for `VALUE=DATE`, `date-time` otherwise. */
  readonly kind: 'date' | 'date-time';
  /** Wall-clock reading, as written in the file. */
  readonly civil: CivilDateTime;
  /** True for the `…Z` (UTC) form. */
  readonly utc: boolean;
}

const DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i;

function valid(civil: CivilDateTime): boolean {
  if (civil.month < 1 || civil.month > 12) return false;
  if (civil.day < 1 || civil.day > daysInMonth(civil.year, civil.month)) return false;
  return civil.hour < 24 && civil.minute < 60 && civil.second < 61;
}

export function parseDateValue(value: string): DateValue | null {
  const text = value.trim();
  const dateOnly = DATE_PATTERN.exec(text);
  if (dateOnly) {
    const civil = {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hour: 0,
      minute: 0,
      second: 0,
    };
    return valid(civil) ? { kind: 'date', civil, utc: false } : null;
  }
  const dateTime = DATE_TIME_PATTERN.exec(text);
  if (!dateTime) return null;
  const civil = {
    year: Number(dateTime[1]),
    month: Number(dateTime[2]),
    day: Number(dateTime[3]),
    hour: Number(dateTime[4]),
    minute: Number(dateTime[5]),
    second: Number(dateTime[6]),
  };
  return valid(civil) ? { kind: 'date-time', civil, utc: dateTime[7] !== undefined } : null;
}

const DURATION_PATTERN = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Duration in milliseconds; `null` when malformed or empty. */
export function parseDurationMs(value: string): number | null {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  if (weeks === undefined && days === undefined && hours === undefined && minutes === undefined && seconds === undefined) {
    return null;
  }
  const total =
    (Number(weeks ?? 0) * 7 + Number(days ?? 0)) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1000;
  return sign === '-' ? -total : total;
}

const OFFSET_PATTERN = /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/;

/** UTC offset (`+0200`, `-0130`, `+02:00`) in minutes east of UTC. */
export function parseUtcOffset(value: string): number | null {
  const match = OFFSET_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -total : total;
}
