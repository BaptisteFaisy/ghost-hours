import type { Block, InvoiceDraft, Minutes } from '@ghost-hours/core';
import { msToMinutes } from '@ghost-hours/core';
import type { AppState } from './types.ts';

/**
 * The devil's advocate (idea I-15) and the defensibility score (idea I-14).
 *
 * A draft that only says "here is what you can bill" is a tool for inflating
 * invoices. This lists what the other side could argue, in the order it would
 * be argued, and scores how well the draft would hold. Everything is derived
 * from the state: no model, no network, no opinion.
 */

export type ObjectionKind =
  | 'unproven'
  | 'assumed'
  | 'unresolved-conflict'
  | 'annex-too-short'
  | 'no-tax-rate'
  | 'rounding-up'
  | 'capped-day';

export interface Objection {
  readonly kind: ObjectionKind;
  readonly minutes: Minutes;
  /** Numbers the interface can interpolate into the translated sentence. */
  readonly values: Readonly<Record<string, string | number>>;
  readonly severity: 'high' | 'medium' | 'low';
}

const SOLID_SHARE = 0.8;
const WEAK_SHARE = 0.5;

export function objectionsTo(
  state: AppState,
  draft: InvoiceDraft,
  blocks: readonly Block[],
): readonly Objection[] {
  return [
    ...weaklyProven(blocks),
    ...assumedMinutes(blocks),
    ...unresolvedConflicts(state, draft),
    ...annexTooShort(state),
    ...missingTaxRate(draft),
    ...roundedUp(draft),
    ...cappedDays(state, draft),
  ];
}

/** Hours billed with little direct evidence: the first thing a client checks. */
function weaklyProven(blocks: readonly Block[]): Objection[] {
  const weak = blocks.filter((block) => block.provenShare < WEAK_SHARE);
  const minutes = Math.round(weak.reduce((sum, block) => sum + msToMinutes(block.end - block.start), 0));
  if (minutes <= 0) return [];
  return [
    {
      kind: 'unproven',
      minutes,
      values: { hours: oneDecimal(minutes / 60), blocks: weak.length },
      severity: weak.some((block) => block.provenShare < 0.2) ? 'high' : 'medium',
    },
  ];
}

function assumedMinutes(blocks: readonly Block[]): Objection[] {
  const minutes = Math.round(blocks.reduce((sum, block) => sum + block.assumedLeadInMinutes, 0));
  if (minutes <= 0) return [];
  return [{ kind: 'assumed', minutes, values: { hours: oneDecimal(minutes / 60) }, severity: 'medium' }];
}

function unresolvedConflicts(state: AppState, draft: InvoiceDraft): Objection[] {
  const open = state.conflicts.filter((conflict) => !conflict.resolved);
  if (open.length === 0) return [];
  const minutes = Math.round(open.reduce((sum, conflict) => sum + msToMinutes(conflict.end - conflict.start), 0));
  void draft;
  return [{ kind: 'unresolved-conflict', minutes, values: { count: open.length }, severity: 'high' }];
}

function annexTooShort(state: AppState): Objection[] {
  if (state.annexDetail === 'with-evidence') return [];
  return [{ kind: 'annex-too-short', minutes: 0, values: {}, severity: 'low' }];
}

function missingTaxRate(draft: InvoiceDraft): Objection[] {
  if (draft.taxRateBp > 0) return [];
  return [{ kind: 'no-tax-rate', minutes: 0, values: {}, severity: 'low' }];
}

function roundedUp(draft: InvoiceDraft): Objection[] {
  if (draft.roundingRule.mode !== 'up') return [];
  return [{ kind: 'rounding-up', minutes: 0, values: { step: draft.roundingRule.stepMinutes }, severity: 'medium' }];
}

function cappedDays(state: AppState, draft: InvoiceDraft): Objection[] {
  const dayLength = state.settings.dayLengthMinutes;
  const perDay = new Map<string, Minutes>();
  for (const block of blocksOfDraft(state, draft)) {
    const key = new Date(block.start).toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + msToMinutes(block.end - block.start));
  }
  const capped = [...perDay.values()].filter((minutes) => minutes > dayLength).length;
  if (capped === 0) return [];
  return [{ kind: 'capped-day', minutes: 0, values: { days: capped }, severity: 'low' }];
}

function blocksOfDraft(state: AppState, draft: InvoiceDraft): readonly Block[] {
  return state.blocks.filter(
    (block) =>
      block.clientId === draft.clientId &&
      (block.status === 'confirmed' || block.status === 'locked') &&
      block.start >= draft.period.start &&
      block.end <= draft.period.end,
  );
}

/**
 * A score out of 100: how well this draft would survive a client's questions.
 * Proven share weighs most, then the absence of open contradictions, then the
 * completeness of the annex and of the tax line.
 */
export function defensibilityScore(
  state: AppState,
  draft: InvoiceDraft,
  blocks: readonly Block[],
  objections: readonly Objection[],
): number {
  if (blocks.length === 0) return 0;
  const proven = blocks.reduce((sum, block) => sum + block.provenShare * (block.end - block.start), 0);
  const total = blocks.reduce((sum, block) => sum + (block.end - block.start), 0);
  const share = total === 0 ? 0 : proven / total;
  const penalties = objections.reduce((sum, objection) => sum + PENALTY[objection.severity], 0);
  const openConflicts = state.conflicts.some((conflict) => !conflict.resolved) ? 15 : 0;
  const solid = share >= SOLID_SHARE ? 10 : 0;
  return clamp(Math.round(share * 80 + solid + 10 - penalties - openConflicts));
}

const PENALTY: Record<Objection['severity'], number> = { high: 12, medium: 6, low: 2 };

function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function oneDecimal(value: number): string {
  return value.toFixed(1);
}
