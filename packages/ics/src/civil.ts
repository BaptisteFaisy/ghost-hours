/**
 * Civil (wall-clock) calendar arithmetic, free of any time zone.
 *
 * Recurrence rules are written in civil terms ("every second Tuesday at
 * 09:00"), so the expansion engine works on civil dates only and converts to
 * instants at the very last step. That separation is what keeps a daily 09:00
 * meeting at 09:00 local across a DST change (HEU-P-11).
 */

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface CivilDateTime extends CivilDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1] ?? 30;
}

export function isValidCivilDate(date: CivilDate): boolean {
  if (date.month < 1 || date.month > 12) return false;
  return date.day >= 1 && date.day <= daysInMonth(date.year, date.month);
}

/** Days since 1970-01-01 (Howard Hinnant's civil calendar algorithm). */
export function dayNumber(date: CivilDate): number {
  const year = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = date.month + (date.month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + date.day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export function fromDayNumber(days: number): CivilDate {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** ISO weekday of a day number: 1 = Monday … 7 = Sunday. */
export function weekdayOfDayNumber(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

/** Pseudo-UTC milliseconds: only meaningful for comparing civil values. */
export function civilToMs(value: CivilDateTime): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
}

export function civilFromMs(ms: number): CivilDateTime {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

export function compareCivil(a: CivilDateTime, b: CivilDateTime): number {
  return civilToMs(a) - civilToMs(b);
}

export function withTime(date: CivilDate, time: CivilDateTime): CivilDateTime {
  return { year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute, second: time.second };
}

export function addMonths(date: CivilDate, months: number): CivilDate {
  const total = date.year * 12 + (date.month - 1) + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1, day: date.day };
}
