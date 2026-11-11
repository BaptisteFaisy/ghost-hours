/** Small helpers shared by the `.ics` test files (fixtures stay inline). */

import { civilFromMs } from './civil.ts';
import { parseIcs } from './parser.ts';
import type { IcsEvent, IcsParseOptions, IcsReport } from './types.ts';

export function report(text: string, options?: IcsParseOptions): IcsReport {
  const result = parseIcs(text, options);
  if (!result.ok) throw new Error(`parse failed: ${result.errors.join('; ')}`);
  return result.value;
}

export function only(value: IcsReport): IcsEvent {
  const [first] = value.events;
  if (value.events.length !== 1 || first === undefined) {
    throw new Error(`expected exactly one event, got ${value.events.length}`);
  }
  return first;
}

/** Wraps component bodies in a VCALENDAR, CRLF separated, as a real export. */
export function calendar(...components: readonly string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ghost Hours//test//EN', ...components, 'END:VCALENDAR', ''].join(
    '\r\n',
  );
}

export function event(lines: readonly string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** `YYYYMMDDTHHMMSS` for an iCalendar fixture (no zone suffix). */
export function stamp(date: { year: number; month: number; day: number }, time = 'T090000'): string {
  return `${pad(date.year, 4)}${pad(date.month)}${pad(date.day)}${time}`;
}

/** `YYYYMMDDTHHMMSSZ` for an instant, as an iCalendar UTC value. */
export function utcStamp(instant: number): string {
  const civil = civilFromMs(instant);
  return `${stamp(civil, `T${pad(civil.hour)}${pad(civil.minute)}${pad(civil.second)}`)}Z`;
}
