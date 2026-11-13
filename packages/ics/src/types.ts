/** Public shapes of the `.ics` reader (HEU-F-02, HEU-F-03). */

import type { Attendee, Instant, MeetingStatus } from '@ghost-hours/core';

export interface IcsEvent {
  readonly uid: string;
  readonly summary: string;
  readonly start: Instant;
  readonly end: Instant;
  /** IANA identifier, or the raw `TZID` of a `VTIMEZONE`; `null` when floating. */
  readonly timeZone: string | null;
  readonly allDay: boolean;
  readonly status: MeetingStatus | null;
  readonly attendees: readonly Attendee[];
  readonly organizerEmail: string | null;
  readonly sequence: number;
  /** Set on an overridden occurrence: the slot it replaces. */
  readonly recurrenceId: Instant | null;
  readonly rrule: string | null;
  readonly exdates: readonly Instant[];
  readonly rdates: readonly Instant[];
  readonly transp: 'opaque' | 'transparent' | null;
  readonly description: string | null;
  /** Every property of the `VEVENT`, raw and still escaped, first value wins. */
  readonly raw: Record<string, string>;
}

export interface SkippedItem {
  /** Physical line of the `BEGIN:VEVENT` that was rejected. */
  readonly line?: number;
  readonly uid?: string;
  readonly reason: string;
}

export interface IcsReport {
  readonly events: readonly IcsEvent[];
  readonly skipped: readonly SkippedItem[];
  readonly warnings: readonly string[];
}

export interface IcsParseOptions {
  /** Zone used for floating times; falls back to `X-WR-TIMEZONE`, then Europe/Paris. */
  readonly defaultTimeZone?: string;
  /** When true, a file with a skipped item is an error instead of a report. */
  readonly strict?: boolean;
}

/** Reasons returned by `skipReason` (HEU-F-03). */
export const SKIP_REASONS = {
  allDay: 'all-day',
  cancelled: 'cancelled',
  transparent: 'transparent',
  declined: 'declined',
} as const;
