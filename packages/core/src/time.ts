import type { Instant } from './types.ts';
import { DAY_MS } from './settings.ts';

/**
 * Zone-aware calendar arithmetic (HEU-N-02).
 *
 * Everything the domain stores is an instant (epoch ms). A "day" or a "week"
 * only exists relative to a time zone, so every calendar helper below takes
 * `timeZone` explicitly and is built on the two primitives `zonedParts` and
 * `zonedTimeToInstant`. That is what makes a DST change a non-event: a day
 * that lasts 23 or 25 hours still starts at 00:00 local and ends at the next
 * 00:00 local (HEU-P-11).
 */

export interface ZonedParts {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** 1 = Monday … 7 = Sunday (ISO). */
  readonly weekday: number;
  /** Offset of the zone at that instant, in minutes east of UTC. */
  readonly offsetMinutes: number;
}

export interface ZonedInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
}

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const DAY_KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = PARTS_FORMATTERS.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    PARTS_FORMATTERS.set(timeZone, cached);
  }
  return cached;
}

function dayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = DAY_KEY_FORMATTERS.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    DAY_KEY_FORMATTERS.set(timeZone, cached);
  }
  return cached;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function zonedParts(instant: Instant, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = WEEKDAY_INDEX[get('weekday')] ?? 1;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    offsetMinutes: Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000),
  };
}

/**
 * Wall-clock in a zone to an instant. On a DST gap the shifted local time wins
 * (the instant stays monotonic); on an overlap the first occurrence wins.
 */
export function zonedTimeToInstant(input: ZonedInput, timeZone: string): Instant {
  const { year, month, day } = input;
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  const second = input.second ?? 0;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstGuess = asUtc - offsetAt(asUtc, timeZone);
  const corrected = asUtc - offsetAt(firstGuess, timeZone);
  return corrected;
}

/** Offset of `timeZone` at `instant`, in minutes east of UTC. */
export function offsetMinutesAt(instant: Instant, timeZone: string): number {
  return offsetAt(instant, timeZone);
}

function offsetAt(instant: Instant, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** `YYYY-MM-DD` in the zone: the join key of every daily aggregation. */
export function dayKeyInZone(instant: Instant, timeZone: string): string {
  return dayKeyFormatter(timeZone).format(new Date(instant));
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function startOfDayInZone(instant: Instant, timeZone: string): Instant {
  const { year, month, day } = zonedParts(instant, timeZone);
  return zonedTimeToInstant({ year, month, day }, timeZone);
}

export interface DayRange {
  readonly dayKey: string;
  readonly start: Instant;
  /** Exclusive. */
  readonly end: Instant;
}

export function dayRangeInZone(instant: Instant, timeZone: string): DayRange {
  const start = startOfDayInZone(instant, timeZone);
  return { dayKey: dayKeyInZone(start, timeZone), start, end: addDaysInZone(start, 1, timeZone) };
}

/** Calendar-day arithmetic: `days` days later at the same wall-clock hour. */
export function addDaysInZone(instant: Instant, days: number, timeZone: string): Instant {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone);
  const shifted = Date.UTC(year, month - 1, day + days, hour, minute, second);
  const parts = new Date(shifted);
  return zonedTimeToInstant(
    {
      year: parts.getUTCFullYear(),
      month: parts.getUTCMonth() + 1,
      day: parts.getUTCDate(),
      hour: parts.getUTCHours(),
      minute: parts.getUTCMinutes(),
      second: parts.getUTCSeconds(),
    },
    timeZone,
  );
}

export function isSameDayInZone(a: Instant, b: Instant, timeZone: string): boolean {
  return dayKeyInZone(a, timeZone) === dayKeyInZone(b, timeZone);
}

/** Monday-based week start unless `weekStartsOn` says otherwise (0 = Sunday). */
export function weekStartInZone(instant: Instant, timeZone: string, weekStartsOn = 1): Instant {
  const { weekday } = zonedParts(instant, timeZone);
  const iso = weekStartsOn === 0 ? 7 : weekStartsOn;
  const back = (weekday - iso + 7) % 7;
  return startOfDayInZone(addDaysInZone(instant, -back, timeZone), timeZone);
}

export function weekDaysInZone(instant: Instant, timeZone: string, weekStartsOn = 1): readonly DayRange[] {
  const start = weekStartInZone(instant, timeZone, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => dayRangeInZone(addDaysInZone(start, i, timeZone), timeZone));
}

export interface MonthRange {
  readonly year: number;
  readonly month: number;
  readonly start: Instant;
  /** Exclusive. */
  readonly end: Instant;
}

export function monthRangeInZone(year: number, month: number, timeZone: string): MonthRange {
  const start = zonedTimeToInstant({ year, month, day: 1 }, timeZone);
  const end = zonedTimeToInstant({ year, month: month + 1, day: 1 }, timeZone);
  return { year, month, start, end };
}

export function monthOfInZone(instant: Instant, timeZone: string): MonthRange {
  const { year, month } = zonedParts(instant, timeZone);
  return monthRangeInZone(year, month, timeZone);
}

export function iterDaysInRange(start: Instant, end: Instant, timeZone: string): readonly DayRange[] {
  const days: DayRange[] = [];
  let cursor = startOfDayInZone(start, timeZone);
  let guard = 0;
  while (cursor < end && guard < 400) {
    days.push(dayRangeInZone(cursor, timeZone));
    cursor = addDaysInZone(cursor, 1, timeZone);
    guard += 1;
  }
  return days;
}

export function clampInstant(value: Instant, min: Instant, max: Instant): Instant {
  return Math.min(max, Math.max(min, value));
}

/** 24-hour `HH:MM` in the zone (HEU-N-05 asks for a 24-hour clock). */
export function formatClockInZone(instant: Instant, timeZone: string): string {
  const { hour, minute } = zonedParts(instant, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

/** Parse `HH:MM` into minutes since midnight; `null` when malformed. */
export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** True when the zone offset changes inside the window: a DST boundary. */
export function spansDstChange(start: Instant, end: Instant, timeZone: string): boolean {
  if (end <= start) return false;
  const before = offsetMinutesAt(start, timeZone);
  const after = offsetMinutesAt(Math.min(end, start + DAY_MS), timeZone);
  return before !== after;
}
