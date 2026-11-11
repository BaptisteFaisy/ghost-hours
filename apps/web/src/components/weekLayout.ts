import type { Block, Instant } from '@ghost-hours/core';
import { formatClockInZone, zonedParts } from '@ghost-hours/core';

/**
 * Layout helpers of the week grid.
 *
 * Two jobs only, and both are pure: turn a block's bounds into a half-hour row
 * inside a day (always through the zone-aware core helpers — never `Date`
 * local arithmetic), and decide which parallel lane a block sits in so that two
 * overlapping blocks are never drawn on top of each other.
 */

/** The grid has one row per half hour. */
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

/** Row index of an instant inside the day it belongs to, in [0, 47]. */
export function slotIndexOf(instant: Instant, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  return Math.min(SLOTS_PER_DAY - 1, Math.floor(minutes / SLOT_MINUTES));
}

/** Clock label of a slot row: the day's start instant plus `slot` half hours. */
export function slotClock(dayStart: Instant, slot: number, timeZone: string): string {
  return formatClockInZone(dayStart + slot * SLOT_MINUTES * 60_000, timeZone);
}

export interface LaidOutBlock {
  readonly block: Block;
  /** 0-based index of the parallel column the block is drawn in. */
  readonly lane: number;
  readonly slot: number;
}

/**
 * Assign each block of one day a lane: the first lane whose previous block has
 * ended, or a new one. Deterministic (sorted by start, then id) so the same
 * week always lays out the same way (HEU-F-16).
 */
export function assignLanes(blocks: readonly Block[], timeZone: string): readonly LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const laneEnds: number[] = [];
  const lanes: LaidOutBlock[][] = [];
  for (const block of sorted) {
    let lane = laneEnds.findIndex((end) => end <= block.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.end);
      lanes.push([]);
    } else {
      laneEnds[lane] = block.end;
    }
    lanes[lane]?.push({ block, lane, slot: slotIndexOf(block.start, timeZone) });
  }
  return lanes.flat().sort((a, b) => a.slot - b.slot || a.lane - b.lane || a.block.id.localeCompare(b.block.id));
}

/** Blocks of one day, grouped by the slot row they start in. */
export function blocksBySlot(
  blocks: readonly Block[],
  timeZone: string,
): ReadonlyMap<number, readonly LaidOutBlock[]> {
  const rows = new Map<number, LaidOutBlock[]>();
  for (const laid of assignLanes(blocks, timeZone)) {
    const row = rows.get(laid.slot) ?? [];
    row.push(laid);
    rows.set(laid.slot, row);
  }
  return rows;
}
