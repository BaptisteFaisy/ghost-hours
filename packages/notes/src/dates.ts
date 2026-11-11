/**
 * The day a note belongs to, read from its path.
 *
 * Four shapes are recognized:
 * - `2026-11-03.md` and `2026-11-03-acme.md` (date in the file name),
 * - `journal-2026-11-03.md` (date glued to a name),
 * - `notes/2026/11/03.md` (date spread over the directories),
 * - `notes/11/03.md` (month and day only) when a fallback year is given.
 */

const DASHED_DATE = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
const SLASHED_DATE = /(?<!\d)(\d{4})\/(\d{1,2})\/(\d{1,2})(?!\d)/;
const MONTH_DAY = /(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/;

/** `YYYY-MM-DD` for the day carried by the path, or `null` when there is none. */
export function dayKeyFromPath(path: string): string | null {
  return dayKeyFromPathWithYear(path, undefined);
}

/** Same as `dayKeyFromPath`, with a year for month/day-only paths. */
export function dayKeyFromPathWithYear(path: string, fallbackYear: number | undefined): string | null {
  const normalized = path.replace(/\\/g, '/');
  const dashed = DASHED_DATE.exec(normalized);
  if (dashed !== null) {
    const key = buildDayKey(dashed[1], dashed[2], dashed[3]);
    if (key !== null) return key;
  }
  const slashed = SLASHED_DATE.exec(normalized);
  if (slashed !== null) {
    const key = buildDayKey(slashed[1], slashed[2], slashed[3]);
    if (key !== null) return key;
  }
  if (fallbackYear !== undefined) {
    const monthDay = MONTH_DAY.exec(normalized);
    if (monthDay !== null) {
      const key = buildDayKey(String(fallbackYear), monthDay[1], monthDay[2]);
      if (key !== null) return key;
    }
  }
  return null;
}

function buildDayKey(year: string | undefined, month: string | undefined, day: string | undefined): string | null {
  if (year === undefined || month === undefined || day === undefined) return null;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!isCalendarDate(y, m, d)) return null;
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** A real calendar date, checked with UTC arithmetic only (HEU-N-02). */
function isCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
