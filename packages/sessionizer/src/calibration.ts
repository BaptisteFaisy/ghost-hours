import type { Minutes, ReconstructionSettings } from '@ghost-hours/core';

/** Step 10 of D.5: after ten corrections, propose the observed median lead-in. */
export interface Calibration {
  readonly samples: number;
  readonly suggestedLeadInMinutes: Minutes | null;
}

export const CALIBRATION_MIN_SAMPLES = 10;

export function calibrate(
  corrections: readonly { readonly acceptedMinutes: Minutes }[],
  settings: ReconstructionSettings,
): Calibration {
  const accepted = corrections
    .map((correction) => correction.acceptedMinutes)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => a - b);
  if (accepted.length < CALIBRATION_MIN_SAMPLES) {
    return { samples: accepted.length, suggestedLeadInMinutes: null };
  }
  const middle = Math.floor(accepted.length / 2);
  const median =
    accepted.length % 2 === 0
      ? ((accepted[middle - 1] ?? 0) + (accepted[middle] ?? 0)) / 2
      : (accepted[middle] ?? 0);
  return {
    samples: accepted.length,
    suggestedLeadInMinutes: Math.min(median, settings.leadInMaxMinutes),
  };
}
