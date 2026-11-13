import type {
  BasisPoints,
  Block,
  Client,
  InvoiceDraft,
  Period,
  Project,
  ReconstructionSettings,
  SupportedLocale,
} from '@ghost-hours/core';
import { billableBlocks, clipToPeriod } from './blocks.ts';
import { buildLines } from './lines.ts';
import { taxFromSubtotal } from './money.ts';
import { roundingNote } from './rounding.ts';

/**
 * The invoice draft (HEU-F-23, HEU-F-25, HEU-P-09).
 *
 * A draft is a *view* of confirmed work, never a stored decision: it is
 * rebuilt from the blocks every time, carries no invoice number, and says
 * `Draft` on its face. Marking a period as invoiced is what freezes the blocks
 * (HEU-F-29) — the draft itself never mutates a block.
 */
export interface DraftInput {
  readonly client: Client;
  readonly period: Period;
  readonly blocks: readonly Block[];
  readonly settings: ReconstructionSettings;
  /** Free-form tax rate in basis points; 0 when the caller omits it. */
  readonly taxRateBp?: BasisPoints;
  readonly freeTextNotes?: readonly string[];
  readonly locale?: SupportedLocale;
  /** Project names to label lines with, when they are not on the client yet. */
  readonly projects?: readonly Project[];
}

function normaliseBp(value: BasisPoints | undefined): BasisPoints {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/** Billable blocks of one client, clipped to the invoiced period. */
function clientBlocks(
  blocks: readonly Block[],
  clientId: string,
  period: Period,
): readonly Block[] {
  return billableBlocks(clipToPeriod(blocks, period)).filter((block) => block.clientId === clientId);
}

export function buildInvoiceDraft(input: DraftInput): InvoiceDraft {
  const locale = input.locale ?? 'en';
  const taxRateBp = normaliseBp(input.taxRateBp);
  const blocks = clientBlocks(input.blocks, input.client.id, input.period);
  const lines = buildLines(blocks, input.client, input.settings, locale, input.projects);
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const taxCents = taxFromSubtotal(subtotalCents, taxRateBp);
  return {
    clientId: input.client.id,
    clientName: input.client.name,
    period: { start: input.period.start, end: input.period.end },
    mode: input.client.mode,
    lines,
    roundingRule: input.client.rounding,
    roundingNote: roundingNote(input.client.rounding, locale),
    subtotalCents,
    taxRateBp,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: input.client.currency,
    freeTextNotes: [...(input.freeTextNotes ?? [])],
    draftLabel: 'Draft',
  };
}

/**
 * Rebuild the rates a draft was made with. A draft keeps no rate of its own, so
 * the unit price of its lines is the only honest source; an empty draft has no
 * rate and rebuilds to the same (empty) totals.
 */
function clientFromDraft(draft: InvoiceDraft): Client {
  const hourly = draft.lines.find((line) => line.unitLabel === 'h');
  const daily = draft.lines.find((line) => line.unitLabel !== 'h');
  return {
    id: draft.clientId,
    name: draft.clientName,
    mode: draft.mode,
    rateCents: hourly ? hourly.unitPriceCents : 0,
    dayRateCents: daily ? daily.unitPriceCents : 0,
    currency: draft.currency,
    rounding: draft.roundingRule,
    projects: draft.lines.flatMap((line) =>
      line.projectId === null ? [] : [{ id: line.projectId, name: line.label }],
    ),
    rules: [],
  };
}

/** Recompute a draft from the blocks (HEU-P-09: same blocks, same total). */
export function recalculateDraft(
  draft: InvoiceDraft,
  blocks: readonly Block[],
  settings: ReconstructionSettings,
): InvoiceDraft {
  const rebuilt = buildInvoiceDraft({
    client: clientFromDraft(draft),
    period: draft.period,
    blocks,
    settings,
    taxRateBp: draft.taxRateBp,
    freeTextNotes: draft.freeTextNotes,
  });
  // The note is the wording the user already reviewed, not a derived value.
  return { ...rebuilt, roundingNote: draft.roundingNote };
}
