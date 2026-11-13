import type { Cents, Instant, Minutes, SupportedLocale } from './types.ts';
import { dayKeyFormatterLocale, formatDayKey } from './format-calendar.ts';

/**
 * Locale-aware rendering (HEU-N-05): English by default, French available.
 * Currency, dates and a 24-hour clock follow the locale; durations never do
 * (they are the one thing two languages must agree on to the minute).
 */

export function formatMinutes(minutes: Minutes): string {
  const whole = Math.round(Math.abs(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const sign = minutes < 0 ? '-' : '';
  if (hours === 0) return `${sign}${rest}m`;
  return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h${pad(rest)}`;
}

/** Decimal hours with one digit: what the month counter shows ("104.0 h"). */
export function formatHours(minutes: Minutes, locale: SupportedLocale = 'en'): string {
  const hours = minutes / 60;
  const unit = locale === 'fr' ? 'h' : 'h';
  return `${hours.toFixed(1)} ${unit}`.replace('.', locale === 'fr' ? ',' : '.');
}

export function formatMoney(cents: Cents, currency: string, locale: SupportedLocale = 'en'): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatPercent(basisPoints: number, locale: SupportedLocale = 'en'): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(basisPoints / 10_000);
}

export function formatDate(instant: Instant, timeZone: string, locale: SupportedLocale = 'en'): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(instant));
}

export function formatTime(instant: Instant, timeZone: string, locale: SupportedLocale = 'en'): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant));
}

export function formatDayLabel(dayKey: string, locale: SupportedLocale = 'en'): string {
  return formatDayKey(dayKey, locale);
}

export function localeTag(locale: SupportedLocale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GB';
}

/** `en-CA` gives an unambiguous `YYYY-MM-DD` for machine-facing output. */
export { dayKeyFormatterLocale };

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** CSV cell escaping (HEU-F-27): quotes doubled, separators quoted. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
