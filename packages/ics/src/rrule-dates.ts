/** Civil-date iteration for the supported recurrence rules. */

import type { CivilDate } from './civil.ts';
import { addMonths, dayNumber, daysInMonth, fromDayNumber, weekdayOfDayNumber } from './civil.ts';
import type { ByDaySpec, RecurrenceRule } from './rrule.ts';

/** Safety net: a rule that never matches stops instead of looping forever. */
const HARD_CAP = 100_000;
/** A rule matching nothing (e.g. 30 February) must not walk to infinity. */
const HORIZON_YEAR = 3000;

function offsetFromWeekStart(weekday: number, weekStartsOn: number): number {
  return (weekday - weekStartsOn + 7) % 7;
}

function wantedMonthDays(rule: RecurrenceRule, year: number, month: number): number[] {
  const limit = daysInMonth(year, month);
  return rule.byMonthDay.map((spec) => (spec > 0 ? spec : limit + spec + 1));
}

function passesMonthFilters(rule: RecurrenceRule, date: CivilDate): boolean {
  if (rule.byMonth.length > 0 && !rule.byMonth.includes(date.month)) return false;
  if (rule.byMonthDay.length > 0 && !wantedMonthDays(rule, date.year, date.month).includes(date.day)) return false;
  if (rule.byDay.length > 0) {
    const weekday = weekdayOfDayNumber(dayNumber(date));
    if (!rule.byDay.some((spec) => spec.weekday === weekday)) return false;
  }
  return true;
}

function weekdayDaysOfMonth(spec: ByDaySpec, year: number, month: number): number[] {
  const limit = daysInMonth(year, month);
  const matches: number[] = [];
  for (let day = 1; day <= limit; day += 1) {
    if (weekdayOfDayNumber(dayNumber({ year, month, day })) === spec.weekday) matches.push(day);
  }
  if (spec.ordinal === null) return matches;
  const index = spec.ordinal > 0 ? spec.ordinal - 1 : matches.length + spec.ordinal;
  const picked = matches[index];
  return picked === undefined ? [] : [picked];
}

/** Days of one month selected by BYMONTHDAY / BYDAY, falling back to `defaultDay`. */
export function monthCandidates(rule: RecurrenceRule, year: number, month: number, defaultDay: number): number[] {
  const limit = daysInMonth(year, month);
  const days: number[] = [];
  if (rule.byMonthDay.length > 0) {
    for (const day of wantedMonthDays(rule, year, month)) {
      if (day >= 1 && day <= limit) days.push(day);
    }
  } else if (rule.byDay.length > 0) {
    for (const spec of rule.byDay) days.push(...weekdayDaysOfMonth(spec, year, month));
  } else if (defaultDay <= limit) {
    days.push(defaultDay);
  }
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (rule.byMonthDay.length === 0 || rule.byDay.length === 0) return unique;
  return unique.filter((day) => rule.byDay.some((spec) => spec.weekday === weekdayOfDayNumber(dayNumber({ year, month, day }))));
}

function* dailyDates(rule: RecurrenceRule, start: CivilDate): Generator<CivilDate> {
  for (let day = dayNumber(start), guard = 0; guard < HARD_CAP; day += rule.interval, guard += 1) {
    const date = fromDayNumber(day);
    if (passesMonthFilters(rule, date)) yield date;
  }
}

function* weeklyDates(rule: RecurrenceRule, start: CivilDate): Generator<CivilDate> {
  const startDay = dayNumber(start);
  const weekdays = rule.byDay.length > 0 ? rule.byDay.map((spec) => spec.weekday) : [weekdayOfDayNumber(startDay)];
  const ordered = [...new Set(weekdays)].sort((a, b) => offsetFromWeekStart(a, rule.wkst) - offsetFromWeekStart(b, rule.wkst));
  const firstWeek = startDay - offsetFromWeekStart(weekdayOfDayNumber(startDay), rule.wkst);
  for (let week = firstWeek, guard = 0; guard < HARD_CAP; week += 7 * rule.interval, guard += 1) {
    for (const weekday of ordered) {
      const day = week + offsetFromWeekStart(weekday, rule.wkst);
      if (day < startDay) continue;
      const date = fromDayNumber(day);
      if (passesMonthFilters(rule, date)) yield date;
    }
  }
}

function* monthlyDates(rule: RecurrenceRule, start: CivilDate): Generator<CivilDate> {
  const startDay = dayNumber(start);
  for (let cursor = { year: start.year, month: start.month }, guard = 0; guard < HARD_CAP; guard += 1) {
    if (cursor.year > HORIZON_YEAR) return;
    if (rule.byMonth.length === 0 || rule.byMonth.includes(cursor.month)) {
      for (const day of monthCandidates(rule, cursor.year, cursor.month, start.day)) {
        const date = { year: cursor.year, month: cursor.month, day };
        if (dayNumber(date) >= startDay) yield date;
      }
    }
    cursor = addMonths({ ...cursor, day: 1 }, rule.interval);
  }
}

function* yearlyDates(rule: RecurrenceRule, start: CivilDate): Generator<CivilDate> {
  const startDay = dayNumber(start);
  const months = rule.byMonth.length > 0 ? [...new Set(rule.byMonth)].sort((a, b) => a - b) : [start.month];
  for (let year = start.year, guard = 0; guard < HARD_CAP && year <= HORIZON_YEAR; year += rule.interval, guard += 1) {
    for (const month of months) {
      for (const day of monthCandidates(rule, year, month, start.day)) {
        const date = { year, month, day };
        if (dayNumber(date) >= startDay) yield date;
      }
    }
  }
}

/** Dates the rule produces, in ascending order, starting at `start` (inclusive). */
export function ruleDates(rule: RecurrenceRule, start: CivilDate): Generator<CivilDate> {
  if (rule.freq === 'DAILY') return dailyDates(rule, start);
  if (rule.freq === 'WEEKLY') return weeklyDates(rule, start);
  if (rule.freq === 'MONTHLY') return monthlyDates(rule, start);
  return yearlyDates(rule, start);
}
