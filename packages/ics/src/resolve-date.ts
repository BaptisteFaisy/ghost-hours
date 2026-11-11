/**
 * DATE / DATE-TIME property resolution: UTC form, `TZID` form (IANA first, then
 * a `VTIMEZONE` observance table) and floating form (HEU-F-03).
 */

import type { Instant } from '@ghost-hours/core';
import type { CivilDateTime } from './civil.ts';
import { civilToMs } from './civil.ts';
import type { ContentLine } from './content-line.ts';
import type { RawComponent } from './components.ts';
import { parseDateValue } from './datetime.ts';
import { allProperties, firstParam } from './props.ts';
import type { VTimezone } from './vtimezone.ts';
import { offsetMinutesIn } from './vtimezone.ts';
import { civilToInstant } from './zone.ts';

export interface DateContext {
  readonly defaultTimeZone: string;
  readonly timeZones: ReadonlyMap<string, VTimezone>;
}

export interface ResolvedDate {
  readonly instant: Instant;
  /** Zone declared by the file, or `null` for a floating / all-day value. */
  readonly timeZone: string | null;
  readonly allDay: boolean;
  /** Wall-clock reading, as written in the file. */
  readonly civil: CivilDateTime;
}

export interface UnresolvedDate {
  readonly reason: string;
}

export function isResolved(value: ResolvedDate | UnresolvedDate): value is ResolvedDate {
  return 'instant' in value;
}

function resolveTzid(civil: CivilDateTime, tzid: string, ctx: DateContext): ResolvedDate | UnresolvedDate {
  const iana = civilToInstant(civil, tzid);
  if (iana !== null) return { instant: iana, timeZone: tzid, allDay: false, civil };
  const custom = ctx.timeZones.get(tzid);
  if (custom) {
    const offset = offsetMinutesIn(custom, civil);
    return { instant: civilToMs(civil) - offset * 60_000, timeZone: tzid, allDay: false, civil };
  }
  return { reason: `unknown time zone "${tzid}" (not an IANA identifier and no VTIMEZONE)` };
}

export function resolveDateValue(line: ContentLine, ctx: DateContext): ResolvedDate | UnresolvedDate {
  const parsed = parseDateValue(line.value);
  if (!parsed) return { reason: `"${line.value}" is not a DATE or DATE-TIME value` };
  const valueType = (firstParam(line, 'VALUE') ?? '').toUpperCase();
  const allDay = parsed.kind === 'date' || valueType === 'DATE';
  if (parsed.utc) return { instant: civilToMs(parsed.civil), timeZone: 'UTC', allDay, civil: parsed.civil };
  const tzid = firstParam(line, 'TZID');
  if (tzid !== undefined && tzid.trim() !== '') {
    const resolved = resolveTzid(parsed.civil, tzid.trim(), ctx);
    return isResolved(resolved) ? { ...resolved, allDay } : resolved;
  }
  const instant = civilToInstant(parsed.civil, ctx.defaultTimeZone) ?? civilToMs(parsed.civil);
  return { instant, timeZone: null, allDay, civil: parsed.civil };
}

/** `EXDATE` / `RDATE`: comma separated, possibly repeated, deduplicated, sorted. */
export function resolveDateList(
  component: RawComponent,
  name: string,
  ctx: DateContext,
  warnings: string[],
): Instant[] {
  const instants: Instant[] = [];
  for (const line of allProperties(component, name)) {
    if ((firstParam(line, 'VALUE') ?? '').toUpperCase() === 'PERIOD') {
      warnings.push(`${name} with VALUE=PERIOD is not supported and is ignored`);
      continue;
    }
    for (const chunk of line.value.split(',')) {
      const value = chunk.trim();
      if (value === '') continue;
      const resolved = resolveDateValue({ ...line, value }, ctx);
      if (isResolved(resolved)) instants.push(resolved.instant);
      else warnings.push(`${name} value "${value}" ignored: ${resolved.reason}`);
    }
  }
  return [...new Set(instants)].sort((a, b) => a - b);
}
