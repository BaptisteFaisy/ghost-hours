/**
 * iCalendar reader for Ghost Hours — a hand-written RFC 5545 subset.
 *
 * Why not a library? The project must stay dependency-light and MIT-clean (the
 * well-known readers are either heavy or carry a licence we would rather not
 * inherit), and we only need what an agenda export actually contains: VEVENT,
 * its times, attendees, recurrence rule and exceptions. Everything outside that
 * subset is *reported* — a skipped item, a warning — never dropped silently
 * (HEU-F-02, risk D.15 "unreadable events are listed, not ignored").
 *
 * Not supported on purpose: VALARM reminders (ignored), attachments, rich
 * VALARM/VFREEBUSY data, PERIOD values, RDATE/EXDATE periods, and the exotic
 * RRULE parts listed in `rrule.ts`.
 */

import { DAY_MS, addDaysInZone, err, ok } from '@ghost-hours/core';
import type { Attendee, AttendeePartStat, Instant, MeetingStatus, ParseResult } from '@ghost-hours/core';
import type { ContentLine } from './content-line.ts';
import { unescapeText } from './content-line.ts';
import type { RawComponent } from './components.ts';
import { buildComponents } from './components.ts';
import { parseDurationMs } from './datetime.ts';
import { allProperties, buildRaw, firstParam, firstProperty, firstValue } from './props.ts';
import type { DateContext, ResolvedDate } from './resolve-date.ts';
import { isResolved, resolveDateList, resolveDateValue } from './resolve-date.ts';
import { parseRRule } from './rrule.ts';
import type { IcsEvent, IcsParseOptions, IcsReport, SkippedItem } from './types.ts';
import { unfoldWithNumbers } from './unfold.ts';
import type { VTimezone } from './vtimezone.ts';
import { parseVTimezone } from './vtimezone.ts';
import { FALLBACK_TIME_ZONE, isIanaTimeZone } from './zone.ts';

const STATUS_MAP: Readonly<Record<string, MeetingStatus>> = {
  CONFIRMED: 'confirmed',
  TENTATIVE: 'tentative',
  CANCELLED: 'cancelled',
};

const PARTSTAT_MAP: Readonly<Record<string, AttendeePartStat>> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  TENTATIVE: 'tentative',
  'NEEDS-ACTION': 'needs-action',
};

function parseStatus(component: RawComponent, uid: string, warnings: string[]): MeetingStatus | null {
  const value = (firstValue(component, 'STATUS') ?? '').trim().toUpperCase();
  if (value === '') return null;
  const status = STATUS_MAP[value];
  if (status === undefined) warnings.push(`event ${uid}: STATUS "${value}" is not a meeting status and is ignored`);
  return status ?? null;
}

function parseTransp(component: RawComponent, uid: string, warnings: string[]): 'opaque' | 'transparent' | null {
  const value = (firstValue(component, 'TRANSP') ?? '').trim().toUpperCase();
  if (value === '') return null;
  if (value === 'OPAQUE') return 'opaque';
  if (value === 'TRANSPARENT') return 'transparent';
  warnings.push(`event ${uid}: TRANSP "${value}" is not understood and is ignored`);
  return null;
}

function parseEmail(value: string): string | null {
  const stripped = value.trim().replace(/^mailto:/i, '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(stripped) ? stripped : null;
}

function attendeeOf(line: ContentLine): Attendee | null {
  const email = parseEmail(line.value);
  if (email === null) return null;
  const partStat = PARTSTAT_MAP[(firstParam(line, 'PARTSTAT') ?? '').toUpperCase()] ?? 'needs-action';
  return { email, partStat };
}

function parseAttendees(component: RawComponent, uid: string, warnings: string[]): Attendee[] {
  const attendees: Attendee[] = [];
  const seen = new Set<string>();
  for (const line of allProperties(component, 'ATTENDEE')) {
    const attendee = attendeeOf(line);
    if (attendee === null) {
      warnings.push(`event ${uid}: ATTENDEE without an email address ignored`);
      continue;
    }
    if (seen.has(attendee.email)) continue;
    seen.add(attendee.email);
    attendees.push(attendee);
  }
  return attendees;
}

function parseSequence(component: RawComponent, uid: string, warnings: string[]): number {
  const raw = firstValue(component, 'SEQUENCE');
  if (raw === undefined) return 0;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0) {
    warnings.push(`event ${uid}: SEQUENCE "${raw}" is not a counter and is ignored`);
    return 0;
  }
  return value;
}

function defaultEnd(start: ResolvedDate, ctx: DateContext): Instant {
  if (!start.allDay) return start.instant;
  const zone = start.timeZone ?? ctx.defaultTimeZone;
  return isIanaTimeZone(zone) ? addDaysInZone(start.instant, 1, zone) : start.instant + DAY_MS;
}

export interface ResolvedTimes {
  readonly start: ResolvedDate;
  readonly end: Instant;
}

export function parseTimes(
  component: RawComponent,
  uid: string,
  ctx: DateContext,
  warnings: string[],
): ResolvedTimes | { readonly reason: string } {
  const dtstart = firstProperty(component, 'DTSTART');
  if (!dtstart) return { reason: 'missing DTSTART' };
  const start = resolveDateValue(dtstart, ctx);
  if (!isResolved(start)) return { reason: `invalid DTSTART: ${start.reason}` };
  const dtend = firstProperty(component, 'DTEND');
  if (dtend) {
    const end = resolveDateValue(dtend, ctx);
    if (!isResolved(end)) return { reason: `invalid DTEND: ${end.reason}` };
    return { start, end: Math.max(end.instant, start.instant) };
  }
  const duration = firstValue(component, 'DURATION');
  if (duration !== undefined) {
    const ms = parseDurationMs(duration);
    if (ms !== null) return { start, end: start.instant + ms };
    warnings.push(`event ${uid}: malformed DURATION "${duration}" ignored`);
  }
  if (!start.allDay) warnings.push(`event ${uid}: no DTEND and no DURATION, zero-length event`);
  return { start, end: defaultEnd(start, ctx) };
}

interface EventBuild {
  readonly event?: IcsEvent;
  readonly skipped?: SkippedItem;
  readonly warnings: readonly string[];
}

function buildEvent(component: RawComponent, ctx: DateContext): EventBuild {
  const warnings: string[] = [];
  const uid = (firstValue(component, 'UID') ?? '').trim();
  if (uid === '') return { skipped: { line: component.line, reason: 'missing UID' }, warnings };
  const times = parseTimes(component, uid, ctx, warnings);
  if ('reason' in times) return { skipped: { line: component.line, uid, reason: times.reason }, warnings };
  const rrule = firstValue(component, 'RRULE')?.trim() ?? null;
  if (rrule !== null) {
    const parsed = parseRRule(rrule);
    if (parsed.ok) for (const note of parsed.value.approximations) warnings.push(`event ${uid}: ${note}`);
    else warnings.push(`event ${uid}: ${parsed.errors.join('; ')}; the event is kept as a single occurrence`);
  }
  const recurrenceId = firstProperty(component, 'RECURRENCE-ID');
  const resolvedRecurrenceId = recurrenceId ? resolveDateValue(recurrenceId, ctx) : null;
  if (resolvedRecurrenceId && !isResolved(resolvedRecurrenceId)) {
    warnings.push(`event ${uid}: invalid RECURRENCE-ID (${resolvedRecurrenceId.reason}), treated as a new event`);
  }
  const organizer = firstValue(component, 'ORGANIZER');
  const description = firstValue(component, 'DESCRIPTION');
  const event: IcsEvent = {
    uid,
    summary: unescapeText(firstValue(component, 'SUMMARY') ?? '').trim(),
    start: times.start.instant,
    end: times.end,
    timeZone: times.start.timeZone,
    allDay: times.start.allDay,
    status: parseStatus(component, uid, warnings),
    attendees: parseAttendees(component, uid, warnings),
    organizerEmail: organizer === undefined ? null : parseEmail(organizer),
    sequence: parseSequence(component, uid, warnings),
    recurrenceId: resolvedRecurrenceId && isResolved(resolvedRecurrenceId) ? resolvedRecurrenceId.instant : null,
    rrule,
    exdates: resolveDateList(component, 'EXDATE', ctx, warnings),
    rdates: resolveDateList(component, 'RDATE', ctx, warnings),
    transp: parseTransp(component, uid, warnings),
    description: description === undefined ? null : unescapeText(description),
    raw: buildRaw(component),
  };
  return { event, warnings };
}

function collectTimeZones(calendar: RawComponent): { timeZones: Map<string, VTimezone>; warnings: string[] } {
  const timeZones = new Map<string, VTimezone>();
  const warnings: string[] = [];
  for (const child of calendar.children) {
    if (child.name !== 'VTIMEZONE') continue;
    const parsed = parseVTimezone(child);
    warnings.push(...parsed.warnings);
    if (parsed.timeZone) timeZones.set(parsed.timeZone.tzid, parsed.timeZone);
  }
  return { timeZones, warnings };
}

const IGNORED_COMPONENTS = new Set(['VTODO', 'VJOURNAL', 'VFREEBUSY']);

interface CalendarScan {
  readonly events: IcsEvent[];
  readonly skipped: SkippedItem[];
  readonly warnings: string[];
}

function scanCalendar(calendar: RawComponent, ctx: DateContext): CalendarScan {
  const events: IcsEvent[] = [];
  const skipped: SkippedItem[] = [];
  const warnings: string[] = [];
  const ignored = new Map<string, number>();
  for (const child of calendar.children) {
    if (child.name === 'VEVENT') {
      const built = buildEvent(child, ctx);
      warnings.push(...built.warnings);
      if (built.event) events.push(built.event);
      else if (built.skipped) skipped.push(built.skipped);
      continue;
    }
    if (IGNORED_COMPONENTS.has(child.name)) ignored.set(child.name, (ignored.get(child.name) ?? 0) + 1);
  }
  for (const name of [...ignored.keys()].sort()) {
    warnings.push(`${ignored.get(name) ?? 0} ${name} component(s) ignored: only VEVENT is read`);
  }
  return { events, skipped, warnings };
}

function resolveDefaultTimeZone(calendar: RawComponent, options: IcsParseOptions, warnings: string[]): string {
  const declared = options.defaultTimeZone ?? firstValue(calendar, 'X-WR-TIMEZONE')?.trim() ?? FALLBACK_TIME_ZONE;
  if (isIanaTimeZone(declared)) return declared;
  warnings.push(`unknown default time zone "${declared}", using ${FALLBACK_TIME_ZONE}`);
  return FALLBACK_TIME_ZONE;
}

export function parseIcs(text: string, options: IcsParseOptions = {}): ParseResult<IcsReport> {
  const tree = buildComponents(unfoldWithNumbers(text));
  const calendar = tree.roots.find((root) => root.name === 'VCALENDAR');
  if (!calendar) return err('not an iCalendar stream: no BEGIN:VCALENDAR component');
  const warnings = [...tree.warnings];
  const defaultTimeZone = resolveDefaultTimeZone(calendar, options, warnings);
  const zones = collectTimeZones(calendar);
  warnings.push(...zones.warnings);
  const scan = scanCalendar(calendar, { defaultTimeZone, timeZones: zones.timeZones });
  warnings.push(...scan.warnings);
  const report: IcsReport = { events: scan.events, skipped: scan.skipped, warnings };
  if (options.strict === true && report.skipped.length > 0) {
    const problems = report.skipped.map((item) => `skipped${item.uid ? ` ${item.uid}` : ''}: ${item.reason}`);
    return err(...problems);
  }
  return ok(report);
}
