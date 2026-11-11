import type { SupportedLocale } from './types.ts';
import { parseDayKey } from './time.ts';

/** `YYYY-MM-DD` to a human day label, without inventing a time of day. */
export function formatDayKey(dayKey: string, locale: SupportedLocale = 'en'): string {
  const { year, month, day } = parseDayKey(dayKey);
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, day));
}

/** Kept explicit: day keys are always `en-CA` (`YYYY-MM-DD`) on disk. */
export function dayKeyFormatterLocale(): string {
  return 'en-CA';
}
