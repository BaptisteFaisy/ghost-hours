import type { Minutes, ReconstructionSettings, RoundingRule } from './types.ts';

/**
 * Defaults from the specification (section D.5). They are deliberately
 * prudent: an assumed lead-in never invents more work than `leadInDefault`
 * and never reaches back before `workdayStart`.
 */
export const DEFAULT_SETTINGS: ReconstructionSettings = {
  gapMaxMinutes: 90,
  leadInDefaultMinutes: 30,
  leadInMaxMinutes: 120,
  minSessionMinutes: 15,
  workdayStart: '07:00',
  tailMinutes: 0,
  timeZone: 'Europe/Paris',
  dayLengthMinutes: 420,
  fullDayFromMinutes: 360,
  halfDayFromMinutes: 150,
};

export const DEFAULT_ROUNDING: RoundingRule = {
  mode: 'nearest',
  stepMinutes: 15,
  scope: 'day',
};

/** A minute is the unit of every duration; instants stay in milliseconds. */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function minutesToMs(minutes: Minutes): number {
  return Math.round(minutes * MINUTE_MS);
}

export function msToMinutes(ms: number): Minutes {
  return ms / MINUTE_MS;
}

/** Whole minutes, rounded half up: what the UI and the annex print. */
export function msToWholeMinutes(ms: number): Minutes {
  return Math.round(msToMinutes(ms));
}

export function clampMinutes(value: Minutes, min: Minutes, max: Minutes): Minutes {
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge user settings over the defaults, rejecting absurd values instead of
 * propagating them (a negative `gapMax` would silently split every session).
 */
export function resolveSettings(patch: Partial<ReconstructionSettings>): ReconstructionSettings {
  const merged: ReconstructionSettings = { ...DEFAULT_SETTINGS, ...stripUndefined(patch) };
  return {
    ...merged,
    gapMaxMinutes: positive(merged.gapMaxMinutes, DEFAULT_SETTINGS.gapMaxMinutes),
    leadInDefaultMinutes: positive(merged.leadInDefaultMinutes, DEFAULT_SETTINGS.leadInDefaultMinutes),
    leadInMaxMinutes: positive(merged.leadInMaxMinutes, DEFAULT_SETTINGS.leadInMaxMinutes),
    minSessionMinutes: positive(merged.minSessionMinutes, DEFAULT_SETTINGS.minSessionMinutes),
    tailMinutes: merged.tailMinutes >= 0 ? merged.tailMinutes : DEFAULT_SETTINGS.tailMinutes,
    workdayStart: isClock(merged.workdayStart) ? merged.workdayStart : DEFAULT_SETTINGS.workdayStart,
    timeZone: merged.timeZone.length > 0 ? merged.timeZone : DEFAULT_SETTINGS.timeZone,
  };
}

function stripUndefined<T extends object>(patch: Partial<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
