import type { Block, Minutes, Period, ReconstructionSettings } from '@ghost-hours/core';
import { dayKeyInZone, msToWholeMinutes } from '@ghost-hours/core';

/**
 * Block selection and day grouping — the shared plumbing of every module in
 * this package. One rule decides everything here (HEU-F-23, prudence): only a
 * block the user confirmed, or one locked by an invoiced period (HEU-F-29),
 * may ever reach an invoice. `proposed`, `rejected` and `conflict` are
 * invisible to billing, so no amount can be built on a guess.
 */
export interface DayGroup {
  readonly dayKey: string;
  readonly blocks: readonly Block[];
}

export function isBillable(block: Block): boolean {
  return block.status === 'confirmed' || block.status === 'locked';
}

function byStartThenId(a: Block, b: Block): number {
  return a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Billable blocks only, in a stable order (HEU-F-16). */
export function billableBlocks(blocks: readonly Block[]): readonly Block[] {
  return blocks.filter(isBillable).slice().sort(byStartThenId);
}

export function blockMinutes(block: Block): Minutes {
  return Math.max(0, msToWholeMinutes(block.end - block.start));
}

export function sumMinutes(blocks: readonly Block[]): Minutes {
  return blocks.reduce((sum, block) => sum + blockMinutes(block), 0);
}

export function dayKeyOf(block: Block, settings: ReconstructionSettings): string {
  return dayKeyInZone(block.start, settings.timeZone);
}

/**
 * Clip to the invoiced period instead of dropping straddling blocks: a session
 * that starts on the 31st and ends on the 1st is billed for the minutes that
 * fall inside the period, nothing more (and nothing less).
 */
export function clipToPeriod(blocks: readonly Block[], period: Period): readonly Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const start = Math.max(block.start, period.start);
    const end = Math.min(block.end, period.end);
    if (end > start) out.push(start === block.start && end === block.end ? block : { ...block, start, end });
  }
  return out;
}

/** Days in ascending `YYYY-MM-DD` order, blocks sorted inside each day. */
export function groupByDay(blocks: readonly Block[], settings: ReconstructionSettings): readonly DayGroup[] {
  const buckets = new Map<string, Block[]>();
  for (const block of billableBlocks(blocks)) {
    const dayKey = dayKeyOf(block, settings);
    const bucket = buckets.get(dayKey);
    if (bucket) bucket.push(block);
    else buckets.set(dayKey, [block]);
  }
  return [...buckets.keys()].sort().map((dayKey) => ({ dayKey, blocks: buckets.get(dayKey) ?? [] }));
}

export function uniqueEvidenceIds(blocks: readonly Block[]): readonly string[] {
  const ids = new Set<string>();
  for (const block of blocks) for (const id of block.evidenceIds) ids.add(id);
  return [...ids].sort();
}

/** Unassigned projects sort last: an invoice lists real projects first. */
export function compareProjectIds(a: string | null, b: string | null): number {
  const left = a ?? '\uffff';
  const right = b ?? '\uffff';
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
