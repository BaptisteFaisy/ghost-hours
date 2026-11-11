/** IANA zone lookups and civil ↔ instant conversion (HEU-N-02). */

import { zonedParts, zonedTimeToInstant } from '@ghost-hours/core';
import type { Instant } from '@ghost-hours/core';
import type { CivilDateTime } from './civil.ts';
import { civilToMs } from './civil.ts';

/** Last-resort zone, per the specification's default settings. */
export const FALLBACK_TIME_ZONE = 'Europe/Paris';

const IANA_CACHE = new Map<string, boolean>();

export function isIanaTimeZone(timeZone: string): boolean {
  const cached = IANA_CACHE.get(timeZone);
  if (cached !== undefined) return cached;
  let valid = true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    valid = false;
  }
  IANA_CACHE.set(timeZone, valid);
  return valid;
}

/** `null` when the zone is not a valid IANA identifier. */
export function civilToInstant(civil: CivilDateTime, timeZone: string): Instant | null {
  if (!isIanaTimeZone(timeZone)) return null;
  return zonedTimeToInstant(civil, timeZone);
}

export function instantToCivil(instant: Instant, timeZone: string): CivilDateTime | null {
  if (!isIanaTimeZone(timeZone)) return null;
  const parts = zonedParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/** Offset in minutes east of UTC that maps `civil` onto `instant`. */
export function offsetOf(civil: CivilDateTime, instant: Instant): number {
  return Math.round((civilToMs(civil) - instant) / 60_000);
}
