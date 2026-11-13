import type { Block, Minutes, ReconstructionSettings } from '@ghost-hours/core';
import { groupByDay, sumMinutes } from './blocks.ts';
import type { DayQuantity } from './modes.ts';

/**
 * Caps and overload warnings (D.6).
 *
 * Two different guards, often confused:
 *
 * - the **cap** is structural: a client is never billed more than one day for
 *   the same calendar day, however many blocks landed on it;
 * - the **warning** is informative: when the day's blocks exceed one working
 *   day across *all* clients, the user is probably double-booking evidence and
 *   should look before invoicing.
 */
export interface OverloadWarning {
  readonly dayKey: string;
  readonly totalMinutes: Minutes;
  readonly thresholdMinutes: Minutes;
}

/**
 * Clamp every day quantity to one day and flag the ones that were clamped.
 * `settings` is accepted for symmetry with the other billing calls; the cap
 * itself is one day per day and per client, not a setting.
 */
export function applyDailyCap(
  quantities: readonly DayQuantity[],
  _settings: ReconstructionSettings,
): readonly DayQuantity[] {
  return quantities.map((quantity) => {
    const clamped = Math.min(1, Math.max(0, quantity.quantityDays));
    return { ...quantity, quantityDays: clamped, capped: quantity.capped || quantity.quantityDays > 1 };
  });
}

/** Days where every client's billable blocks together exceed one day. */
export function detectOverloadedDays(
  blocks: readonly Block[],
  settings: ReconstructionSettings,
): readonly OverloadWarning[] {
  const thresholdMinutes = settings.dayLengthMinutes;
  return groupByDay(blocks, settings)
    .map((day) => ({ dayKey: day.dayKey, totalMinutes: sumMinutes(day.blocks), thresholdMinutes }))
    .filter((warning) => warning.totalMinutes > warning.thresholdMinutes);
}
