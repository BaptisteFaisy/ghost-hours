/** Events that must not become work evidence (HEU-F-03). */

import type { IcsEvent } from './types.ts';
import { SKIP_REASONS } from './types.ts';

function isDeclinedOnly(event: IcsEvent): boolean {
  const organizer = event.organizerEmail?.toLowerCase();
  if (organizer === undefined || event.attendees.length === 0) return false;
  if (event.attendees.some((attendee) => attendee.email.toLowerCase() !== organizer)) return false;
  return event.attendees.every((attendee) => attendee.partStat === 'declined');
}

/**
 * `null` when the event can be counted as worked time, otherwise the reason it
 * is set aside: all-day, cancelled, marked free ("disponible"), or declined by
 * its only participant (the organizer).
 */
export function skipReason(event: IcsEvent): string | null {
  if (event.allDay) return SKIP_REASONS.allDay;
  if (event.status === 'cancelled') return SKIP_REASONS.cancelled;
  if (event.transp === 'transparent') return SKIP_REASONS.transparent;
  if (isDeclinedOnly(event)) return SKIP_REASONS.declined;
  return null;
}
