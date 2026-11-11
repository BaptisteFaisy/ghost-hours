import type { Minutes } from '@ghost-hours/core';
import { formatHours } from '@ghost-hours/core';

/**
 * Small presentation helpers shared by the screens.
 *
 * The heavy lifting (dates, money, durations) is done by `@ghost-hours/core`;
 * these only trim what the core already produced.
 */

/** `104.0 h` → `104 h`, `12.5 h` → `12.5 h`. */
export function formatHoursShort(minutes: Minutes, locale: 'en' | 'fr'): string {
  const text = formatHours(minutes, locale);
  return text.replace(/([.,])0(\s)/, '$2');
}
