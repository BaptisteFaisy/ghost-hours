import type { Block, Evidence, Minutes } from '@ghost-hours/core';
import { dayKeyInZone, msToMinutes, zonedParts } from '@ghost-hours/core';
import type { AppState } from './types.ts';

/**
 * Two answers the product owes its user (ideas I-01 and I-15).
 *
 * `explainGap` says where the undeclared hours come from, in causes the user
 * recognises. `objectionsTo` plays the other side: what a client could argue
 * against this draft. Both are pure functions of the state — no model, no
 * network, no hidden clock — because an explanation that cannot be
 * recomputed is not an explanation.
 */

export type GapCauseKind = 'evening' | 'weekend' | 'meeting' | 'assumed' | 'other';

export interface GapCause {
  readonly kind: GapCauseKind;
  readonly minutes: Minutes;
}

export interface GapExplanation {
  readonly ghostMinutes: Minutes;
  readonly causes: readonly GapCause[];
  readonly explainedMinutes: Minutes;
  readonly unexplainedMinutes: Minutes;
}

/** Cause keys, longest first: the evening share of a meeting counts as evening. */
const CAUSE_ORDER: readonly GapCauseKind[] = ['evening', 'weekend', 'meeting', 'assumed', 'other'];

const EVENING_STARTS_AT = 19;
const EARLY_ENDS_AT = 7;

/**
 * Split the hours that were found but not declared into causes.
 *
 * Only blocks the user has not confirmed yet are considered: confirmed work is
 * work the user already knows about. The categories overlap in reality (an
 * evening meeting is both), so they are counted in a fixed order and each
 * minute is counted once — the order is part of the answer and is documented.
 */
export function explainGap(state: AppState, clientId: string | null): GapExplanation {
  const declared = clientId === null ? totalDeclared(state) : (state.declaredMinutes[clientId] ?? null);
  const found = minutesOf(countedBlocks(state, clientId));
  const ghostMinutes = declared === null ? 0 : Math.max(0, found - declared);
  const causes = attributeCauses(
    undecidedBlocks(state, clientId),
    state.settings.timeZone,
    ghostMinutes,
    meetingSpans(state.evidence),
  );
  const explainedMinutes = causes.reduce((sum, cause) => sum + cause.minutes, 0);
  return {
    ghostMinutes,
    causes,
    explainedMinutes,
    unexplainedMinutes: Math.max(0, ghostMinutes - explainedMinutes),
  };
}

/** What the user has found but not yet confirmed: the material of the gap. */
function undecidedBlocks(state: AppState, clientId: string | null): readonly Block[] {
  return state.blocks.filter(
    (block) => block.status === 'proposed' && inActiveMonth(state, block) && matches(block, clientId),
  );
}

function matches(block: Block, clientId: string | null): boolean {
  return clientId === null || block.clientId === clientId;
}

function totalDeclared(state: AppState): number | null {
  const values = Object.values(state.declaredMinutes).filter((v): v is number => v !== null);
  return values.length === 0 ? null : values.reduce((sum, minutes) => sum + minutes, 0);
}

/** Blocks that count towards "found": everything but rejected and conflicted. */
export function countedBlocks(state: AppState, clientId: string | null): readonly Block[] {
  return state.blocks.filter(
    (block) =>
      (block.status === 'proposed' || block.status === 'confirmed' || block.status === 'locked') &&
      inActiveMonth(state, block) &&
      matches(block, clientId),
  );
}

export function minutesOf(blocks: readonly Block[]): Minutes {
  return blocks.reduce((sum, block) => sum + msToMinutes(block.end - block.start), 0);
}

function inActiveMonth(state: AppState, block: Block): boolean {
  const key = dayKeyInZone(block.start, state.settings.timeZone);
  return key.startsWith(`${state.activeMonth.year}-${pad(state.activeMonth.month)}`);
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The real span of every meeting, by evidence id: a merged block does not remember it. */
function meetingSpans(evidence: readonly Evidence[]): ReadonlyMap<string, { start: number; end: number }> {
  const spans = new Map<string, { start: number; end: number }>();
  for (const item of evidence) {
    if (typeof item.start === 'number' && typeof item.end === 'number') spans.set(item.id, { start: item.start, end: item.end });
  }
  return spans;
}

/** Assign each minute of the candidate blocks to exactly one cause, in order. */
function attributeCauses(
  blocks: readonly Block[],
  timeZone: string,
  budget: Minutes,
  spans: ReadonlyMap<string, { start: number; end: number }>,
): readonly GapCause[] {
  const totals: Record<GapCauseKind, Minutes> = { evening: 0, weekend: 0, meeting: 0, assumed: 0, other: 0 };
  for (const block of blocks) {
    const parts = splitBlockMinutes(block, timeZone, spans);
    for (const kind of Object.keys(parts) as GapCauseKind[]) totals[kind] += parts[kind];
  }
  const causes: GapCause[] = [];
  let left = budget;
  for (const kind of CAUSE_ORDER) {
    const minutes = Math.min(Math.round(totals[kind]), Math.max(0, Math.round(left)));
    if (minutes > 0) causes.push({ kind, minutes });
    left -= minutes;
  }
  return causes;
}

/**
 * Minutes of one block per cause, each counted once: evening and weekend first
 * (they are the most striking), then the assumed lead-in, then meetings, then
 * what is left.
 */
/**
 * Minutes of one block per cause, each counted once. The order is the answer:
 * evenings and weekends first (the most striking), then the meetings taken from
 * the calendar, then the assumed lead-in, then what is left. A merged block has
 * lost the meeting's own bounds, so they are read back from the evidence.
 */
function splitBlockMinutes(
  block: Block,
  timeZone: string,
  spans: ReadonlyMap<string, { start: number; end: number }>,
): Record<GapCauseKind, Minutes> {
  const out: Record<GapCauseKind, Minutes> = { evening: 0, weekend: 0, meeting: 0, assumed: 0, other: 0 };
  const total = msToMinutes(block.end - block.start);
  const assumedTotal = Math.min(block.assumedLeadInMinutes, total);
  const evening = minutesOutOfHours(block, timeZone);
  const weekend = Math.max(0, minutesOnWeekend(block, timeZone) - overlapEveningWeekend(block, timeZone));
  const meetingTotal = meetingMinutes(block, spans);
  let left = total;
  out.evening = Math.min(evening, left);
  left -= out.evening;
  out.weekend = Math.min(weekend, left);
  left -= out.weekend;
  out.meeting = Math.min(meetingTotal, left);
  left -= out.meeting;
  out.assumed = Math.min(assumedTotal, left);
  left -= out.assumed;
  out.other = Math.max(0, left);
  return out;
}

/** Minutes of the meetings a block contains, clipped to the block. */
function meetingMinutes(block: Block, spans: ReadonlyMap<string, { start: number; end: number }>): Minutes {
  let total = 0;
  for (const id of block.evidenceIds) {
    const span = spans.get(id);
    if (span === undefined) continue;
    const start = Math.max(span.start, block.start);
    const end = Math.min(span.end, block.end);
    if (end > start) total += msToMinutes(end - start);
  }
  return total;
}

function minutesOutOfHours(block: Block, timeZone: string): Minutes {
  return minutesMatching(block, timeZone, (hour) => hour >= EVENING_STARTS_AT || hour < EARLY_ENDS_AT);
}

function minutesOnWeekend(block: Block, timeZone: string): Minutes {
  return minutesMatching(block, timeZone, (_hour, weekday) => weekday >= 6);
}

function overlapEveningWeekend(block: Block, timeZone: string): Minutes {
  return minutesMatching(
    block,
    timeZone,
    (hour, weekday) => weekday >= 6 && (hour >= EVENING_STARTS_AT || hour < EARLY_ENDS_AT),
  );
}

/** Slice the block hour by hour and keep what matches — coarse, honest, cheap. */
function minutesMatching(
  block: Block,
  timeZone: string,
  predicate: (hour: number, weekday: number) => boolean,
): Minutes {
  const step = 15 * 60_000;
  let minutes = 0;
  for (let at = block.start; at < block.end; at += step) {
    const parts = zonedParts(at, timeZone);
    if (predicate(parts.hour, parts.weekday)) minutes += Math.min(15, msToMinutes(block.end - at));
  }
  return minutes;
}
