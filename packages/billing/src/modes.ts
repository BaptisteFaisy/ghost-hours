import type { Block, Client, Minutes, ReconstructionSettings, RoundingRule } from '@ghost-hours/core';
import { billableBlocks, blockMinutes, dayKeyOf, groupByDay, sumMinutes } from './blocks.ts';
import { applyDailyCap } from './caps.ts';
import { applyRoundingByScope } from './rounding.ts';

/**
 * The three billing modes of D.6 (HEU-F-24).
 *
 * All of them start from the same input: billable blocks (HEU-F-23). They
 * differ only in how minutes become a billable quantity:
 *
 * - `hourly`: minutes, rounded per the client's rule;
 * - `daily-thresholds`: 0, 0.5 or 1 day per day and per client (HEU-P-10);
 * - `daily-proportional`: the day's minutes over the length of a day, capped
 *   at one day.
 */
export interface DayQuantity {
  readonly dayKey: string;
  /** Real minutes of the day: kept for traceability, never for the amount. */
  readonly minutes: Minutes;
  /** Billable quantity, in days. */
  readonly quantityDays: number;
  /** True when the raw quantity was above one day and got clamped. */
  readonly capped: boolean;
}

export interface HourlyQuantity {
  readonly quantityMinutes: Minutes;
  readonly perDay: readonly DayQuantity[];
}

/** Total of the confirmed and locked blocks, in minutes (HEU-F-23). */
export function billableMinutes(blocks: readonly Block[]): Minutes {
  return billableBlocks(blocks).reduce((sum, block) => sum + blockMinutes(block), 0);
}

function dayLengthOf(settings: ReconstructionSettings): Minutes {
  return settings.dayLengthMinutes > 0 ? settings.dayLengthMinutes : 1;
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Hourly quantity, with the rounding rule applied at the requested scope. */
export function hourlyQuantity(
  blocks: readonly Block[],
  settings: ReconstructionSettings,
  rule: RoundingRule,
): HourlyQuantity {
  const billable = billableBlocks(blocks);
  const rounded = applyRoundingByScope(
    billable.map((block) => ({
      minutes: blockMinutes(block),
      dayKey: dayKeyOf(block, settings),
      blockId: block.id,
    })),
    rule,
  );
  const quantityMinutes = rounded.reduce((sum, entry) => sum + entry.minutes, 0);
  const dayLength = dayLengthOf(settings);
  const perDay = groupByDay(billable, settings).map((day) => {
    const minutes = sumMinutes(day.blocks);
    return { dayKey: day.dayKey, minutes, quantityDays: minutes / dayLength, capped: false };
  });
  return { quantityMinutes, perDay };
}

/** Day quantities for one client: 1 day, half a day, or nothing (HEU-P-10). */
export function dailyThresholds(
  blocks: readonly Block[],
  client: Client,
  settings: ReconstructionSettings,
): readonly DayQuantity[] {
  const own = billableBlocks(blocks).filter((block) => block.clientId === client.id);
  return groupByDay(own, settings).map((day) => {
    const minutes = sumMinutes(day.blocks);
    const quantityDays =
      minutes >= settings.fullDayFromMinutes ? 1 : minutes >= settings.halfDayFromMinutes ? 0.5 : 0;
    return { dayKey: day.dayKey, minutes, quantityDays, capped: false };
  });
}

/** Minutes over a day's length, capped at one day (D.6, third row). */
export function dailyProportional(
  blocks: readonly Block[],
  settings: ReconstructionSettings,
): readonly DayQuantity[] {
  const dayLength = dayLengthOf(settings);
  return groupByDay(blocks, settings).map((day) => {
    const minutes = sumMinutes(day.blocks);
    const raw = minutes / dayLength;
    return {
      dayKey: day.dayKey,
      minutes,
      quantityDays: raw >= 1 ? 1 : roundTo3(raw),
      capped: raw > 1,
    };
  });
}

/**
 * Day quantities of a client, whichever daily mode it bills with.
 *
 * The cap is applied here rather than left to each mode: it is a guard, not a
 * billing mode, and a guard only one caller applies is a guard that will be
 * forgotten. One calendar day is never billed more than one day (D.6).
 */
export function clientDayQuantities(
  blocks: readonly Block[],
  client: Client,
  settings: ReconstructionSettings,
): readonly DayQuantity[] {
  const quantities =
    client.mode === 'daily-proportional'
      ? dailyProportional(blocks.filter((block) => block.clientId === client.id), settings)
      : dailyThresholds(blocks, client, settings);
  return applyDailyCap(quantities, settings);
}
