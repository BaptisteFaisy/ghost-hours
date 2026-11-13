/**
 * The civil clock of an event: the wall-clock reading declared by `DTSTART`
 * plus the zone it belongs to. Recurrence expansion needs the declared reading,
 * not a re-derived one, so a floating event keeps its 09:00 whatever zone the
 * caller passes for display (HEU-P-11).
 */

import type { Instant } from '@ghost-hours/core';
import type { CivilDateTime } from './civil.ts';
import { civilFromMs, civilToMs } from './civil.ts';
import { parseDateValue } from './datetime.ts';
import type { IcsEvent } from './types.ts';
import { civilToInstant, instantToCivil, offsetOf } from './zone.ts';

export interface EventClock {
  readonly civil: CivilDateTime;
  readonly timeZone: string;
  /** Set when the zone is not IANA: occurrences keep the `DTSTART` offset. */
  readonly fixedOffsetMinutes: number | null;
}

function declaredCivil(event: IcsEvent): CivilDateTime | null {
  const raw = event.raw['DTSTART'];
  if (raw === undefined) return null;
  const parsed = parseDateValue(raw);
  return parsed === null ? null : parsed.civil;
}

export function eventClock(event: IcsEvent, defaultTimeZone: string): EventClock {
  const timeZone = event.timeZone ?? defaultTimeZone;
  const civil = declaredCivil(event) ?? instantToCivil(event.start, timeZone) ?? civilFromMs(event.start);
  const resolved = civilToInstant(civil, timeZone);
  return { civil, timeZone, fixedOffsetMinutes: resolved === null ? offsetOf(civil, event.start) : null };
}

export function clockInstant(clock: EventClock, civil: CivilDateTime): Instant {
  const instant = civilToInstant(civil, clock.timeZone);
  if (instant !== null) return instant;
  return civilToMs(civil) - (clock.fixedOffsetMinutes ?? 0) * 60_000;
}
