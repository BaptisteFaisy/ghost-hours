/**
 * Timestamps written at the start of a note line.
 *
 * Recognized shapes (all 24-hour):
 * - `- 14:02 …`, `* 14:02 — …`, `+ 14:02 …` (bullet),
 * - `[14:02] …` and `- [14:02] …` (bracketed),
 * - `14h02 …` (French clock),
 * - `2026-11-03T14:02 …`, with or without seconds, with or without an
 *   explicit offset (`Z` or `±HH:MM`).
 *
 * Only a line whose timestamp starts it is a candidate: a clock buried in a
 * sentence is not a proof.
 */

/** Calendar part of a timestamped line, when the line carries one. */
export interface LineDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface LineTimestamp {
  /** Present only for the `YYYY-MM-DDThh:mm` shape. */
  readonly date?: LineDate;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** Minutes east of UTC, present only when the line states an offset. */
  readonly offsetMinutes?: number;
  /** The line after its timestamp marker. */
  readonly rest: string;
}

export type TimestampParse =
  | { readonly kind: 'timestamp'; readonly timestamp: LineTimestamp }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'none' };

const ISO_PATTERN = /^\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})?\s*(.*)$/;
const BRACKET_PATTERN = /^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/;
const BULLET_PATTERN = /^\s*[-*+]\s+\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/;
const FRENCH_PATTERN = /^\s*(?:[-*+]\s+)?(\d{1,2})h(\d{2})\s*(.*)$/;

interface RawClock {
  readonly date?: LineDate;
  readonly hour: string;
  readonly minute: string;
  readonly second?: string;
  readonly offset?: string;
  readonly rest: string;
}

/** Read the timestamp at the start of a line. */
export function parseLineTimestamp(line: string): TimestampParse {
  const iso = ISO_PATTERN.exec(line);
  if (iso !== null) {
    return build({
      date: isoDate(iso[1], iso[2], iso[3]),
      hour: pick(iso[4]),
      minute: pick(iso[5]),
      second: iso[6],
      offset: iso[7],
      rest: iso[8] ?? '',
    });
  }
  for (const match of [BRACKET_PATTERN, BULLET_PATTERN]) {
    const found = match.exec(line);
    if (found !== null) {
      return build({ hour: pick(found[1]), minute: pick(found[2]), second: found[3], rest: found[4] ?? '' });
    }
  }
  const french = FRENCH_PATTERN.exec(line);
  if (french !== null) {
    return build({ hour: pick(french[1]), minute: pick(french[2]), rest: french[3] ?? '' });
  }
  return { kind: 'none' };
}

function build(raw: RawClock): TimestampParse {
  const hour = Number(raw.hour);
  const minute = Number(raw.minute);
  const second = raw.second === undefined ? 0 : Number(raw.second);
  if (!isClock(hour, minute, second)) {
    return { kind: 'invalid', reason: `not a clock: ${raw.hour}:${raw.minute}` };
  }
  const offsetMinutes = raw.offset === undefined ? undefined : parseOffset(raw.offset);
  if (offsetMinutes === undefined && raw.offset !== undefined) {
    return { kind: 'invalid', reason: `not a zone offset: ${raw.offset}` };
  }
  const timestamp: LineTimestamp = {
    date: raw.date,
    hour,
    minute,
    second,
    offsetMinutes,
    rest: raw.rest,
  };
  return { kind: 'timestamp', timestamp };
}

function isoDate(year: string | undefined, month: string | undefined, day: string | undefined): LineDate | undefined {
  if (year === undefined || month === undefined || day === undefined) return undefined;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function isClock(hour: number, minute: number, second: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

/** `Z`, `+01:00` or `-0500` into minutes east of UTC. */
export function parseOffset(value: string): number | undefined {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === 'Z') return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(trimmed);
  if (match === null) return undefined;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function pick(value: string | undefined): string {
  return value ?? '0';
}
