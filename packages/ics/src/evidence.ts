/** Calendar events to `Evidence` rows (HEU-F-02). */

import { meetingEvidenceId } from '@ghost-hours/core';
import type { Evidence } from '@ghost-hours/core';
import { skipReason } from './skip.ts';
import type { IcsEvent } from './types.ts';

function toMeetingEvidence(event: IcsEvent, defaultTimeZone: string | undefined): Evidence {
  const timeZone = event.timeZone ?? defaultTimeZone;
  return {
    id: meetingEvidenceId(event.uid, event.start),
    source: 'calendar',
    kind: 'meeting',
    clientId: null,
    start: event.start,
    end: event.end,
    title: event.summary,
    attendees: event.attendees,
    organizerEmail: event.organizerEmail ?? undefined,
    status: event.status ?? undefined,
    allDay: event.allDay,
    recurring: event.rrule !== null || event.rdates.length > 0 || event.recurrenceId !== null,
    timeZone,
    raw: { ...event.raw },
  };
}

/**
 * Keeps only the events that prove worked time; the rest is dropped through
 * `skipReason` (all-day, cancelled, free, declined). Ids are deterministic
 * (`meetingEvidenceId`), so re-importing the same file changes nothing (HEU-F-06).
 */
export function toEvidence(events: readonly IcsEvent[], options: { readonly defaultTimeZone?: string } = {}): Evidence[] {
  return events
    .filter((event) => skipReason(event) === null)
    .map((event) => toMeetingEvidence(event, options.defaultTimeZone));
}
