import type {
  Block,
  Client,
  InvoiceLine,
  Minutes,
  Project,
  ReconstructionSettings,
  RoundingRule,
  SupportedLocale,
} from '@ghost-hours/core';
import { allocateUnits } from './allocate.ts';
import { formatHours } from '@ghost-hours/core';
import { billableBlocks, blockMinutes, compareProjectIds, dayKeyOf, groupByDay } from './blocks.ts';
import { labels } from './labels.ts';
import { amountFromDays, amountFromHours } from './money.ts';
import { clientDayQuantities } from './modes.ts';
import { applyRoundingByScope } from './rounding.ts';

/**
 * Invoice lines, per project (HEU-F-23).
 *
 * Every mode ends up as an integer number of *units* per project, then as a
 * quantity: minutes/60 for hourly, halves or thousandths of a day for the
 * daily modes. Keeping units integral is what makes a line impossible to
 * double-count: the rounded total of a day is split exactly, never
 * proportionally-with-drift.
 */
export interface LineAmount {
  readonly projectId: string | null;
  /** Billable quantity: hours for `hourly`, days for the daily modes. */
  readonly quantity: number;
  /** Minutes behind the quantity: billed minutes, or real minutes for days. */
  readonly quantityMinutes: Minutes;
  readonly evidenceIds: readonly string[];
}

interface Acc {
  readonly projectId: string | null;
  units: number;
  minutes: Minutes;
  readonly evidence: Set<string>;
}

interface Slice {
  readonly minutes: Minutes;
  readonly evidenceIds: readonly string[];
}

const HOUR_UNITS = 60;

function accOf(map: Map<string, Acc>, projectId: string | null): Acc {
  const key = projectId ?? '';
  const existing = map.get(key);
  if (existing) return existing;
  const created: Acc = { projectId, units: 0, minutes: 0, evidence: new Set<string>() };
  map.set(key, created);
  return created;
}

function toAmounts(map: Map<string, Acc>, unitsPerQuantity: number): readonly LineAmount[] {
  return [...map.values()]
    .sort((a, b) => compareProjectIds(a.projectId, b.projectId))
    .map((acc) => ({
      projectId: acc.projectId,
      quantity: acc.units / unitsPerQuantity,
      quantityMinutes: acc.minutes,
      evidenceIds: [...acc.evidence].sort(),
    }));
}

function slicesOf(blocks: readonly Block[]): ReadonlyMap<string, Slice> {
  const raw = new Map<string, { minutes: Minutes; ids: Set<string> }>();
  for (const block of blocks) {
    const key = block.projectId ?? '';
    const slice = raw.get(key) ?? { minutes: 0, ids: new Set<string>() };
    slice.minutes += blockMinutes(block);
    for (const id of block.evidenceIds) slice.ids.add(id);
    raw.set(key, slice);
  }
  const out = new Map<string, Slice>();
  for (const [key, slice] of raw) out.set(key, { minutes: slice.minutes, evidenceIds: [...slice.ids].sort() });
  return out;
}

function hourlyAmounts(
  blocks: readonly Block[],
  settings: ReconstructionSettings,
  rule: RoundingRule,
): readonly LineAmount[] {
  const billable = billableBlocks(blocks);
  const rounded = new Map(
    applyRoundingByScope(
      billable.map((block) => ({
        minutes: blockMinutes(block),
        dayKey: dayKeyOf(block, settings),
        blockId: block.id,
      })),
      rule,
    ).map((entry) => [entry.blockId, entry.minutes]),
  );
  const accs = new Map<string, Acc>();
  for (const block of billable) {
    const acc = accOf(accs, block.projectId);
    acc.units += rounded.get(block.id) ?? 0;
    acc.minutes += rounded.get(block.id) ?? 0;
    for (const id of block.evidenceIds) acc.evidence.add(id);
  }
  return toAmounts(accs, HOUR_UNITS);
}

function unitsPerDayOf(mode: Client['mode']): number {
  return mode === 'daily-thresholds' ? 2 : 1000;
}

function dailyAmounts(
  blocks: readonly Block[],
  client: Client,
  settings: ReconstructionSettings,
): readonly LineAmount[] {
  const billable = billableBlocks(blocks).filter((block) => block.clientId === client.id);
  const unitsPerDay = unitsPerDayOf(client.mode);
  const dayBlocks = new Map(groupByDay(billable, settings).map((day) => [day.dayKey, day.blocks]));
  const accs = new Map<string, Acc>();
  for (const quantity of clientDayQuantities(billable, client, settings)) {
    const blocksOfDay = dayBlocks.get(quantity.dayKey) ?? [];
    const slices = slicesOf(blocksOfDay);
    const units = Math.round(quantity.quantityDays * unitsPerDay);
    const weights = [...slices.entries()].map(([key, slice]) => ({ key, weight: slice.minutes }));
    for (const entry of allocateUnits(units, weights)) {
      const acc = accOf(accs, entry.key === '' ? null : entry.key);
      const slice = slices.get(entry.key);
      acc.units += entry.units;
      acc.minutes += slice ? slice.minutes : 0;
      for (const id of slice ? slice.evidenceIds : []) acc.evidence.add(id);
    }
  }
  return toAmounts(accs, unitsPerDay);
}

function projectLabel(
  projectId: string | null,
  client: Client,
  projects: readonly Project[] | undefined,
  unassigned: string,
): string {
  if (projectId === null) return unassigned;
  const given = projects ? projects.find((project) => project.id === projectId) : undefined;
  if (given) return given.name;
  const own = client.projects.find((project) => project.id === projectId);
  return own ? own.name : projectId;
}

/** The draft's lines: one per project, unassigned last, zero lines dropped. */
export function buildLines(
  blocks: readonly Block[],
  client: Client,
  settings: ReconstructionSettings,
  locale: SupportedLocale,
  projects?: readonly Project[],
): readonly InvoiceLine[] {
  const text = labels(locale);
  const hourly = client.mode === 'hourly';
  const amounts = hourly
    ? hourlyAmounts(blocks, settings, client.rounding)
    : dailyAmounts(blocks, client, settings);
  return amounts
    .filter((amount) => amount.quantity > 0)
    .map((amount) => ({
      projectId: amount.projectId,
      label: projectLabel(amount.projectId, client, projects, text.unassigned),
      quantityMinutes: amount.quantityMinutes,
      unitLabel: hourly ? 'h' : 'day',
      unitPriceCents: hourly ? client.rateCents : client.dayRateCents,
      amountCents: hourly
        ? amountFromHours(amount.quantityMinutes, client.rateCents)
        : amountFromDays(amount.quantity, client.dayRateCents),
      evidenceCount: amount.evidenceIds.length,
    }));
}

/**
 * The billable quantity of a line: hours for `h`, days for `day`.
 *
 * `quantityMinutes` holds real minutes on a daily line (traceability), so the
 * day count is read back from the amount and the day rate. Both are integers in
 * cents, which makes the division exact for the rates a client actually uses.
 */
export function lineQuantityValue(line: InvoiceLine): number {
  if (line.unitLabel === 'h') return line.quantityMinutes / 60;
  return line.unitPriceCents > 0 ? line.amountCents / line.unitPriceCents : 0;
}

/** Quantity and unit, as printed on the draft: `1.50 day`, `104.0 h`. */
export function formatLineQuantity(line: InvoiceLine, locale: SupportedLocale): string {
  if (line.unitLabel === 'h') return formatHours(line.quantityMinutes, locale);
  const text = lineQuantityValue(line).toFixed(2);
  return `${locale === 'fr' ? text.replace('.', ',') : text} ${line.unitLabel}`;
}
