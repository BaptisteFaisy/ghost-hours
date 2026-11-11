import type { Block, Evidence, Instant, ReconstructionSettings } from '@ghost-hours/core';
import { blockId } from '@ghost-hours/core';
import {
  coverageRatio,
  durationMs,
  makeInterval,
  nonEmptyIntervals,
  subtractAll,
  totalDurationMs,
  union,
  type Interval,
} from '@ghost-hours/intervals';
import type { BlockDraft, PointProof, Session } from './types.ts';

/** Steps 6 to 9 of D.5: build drafts, resolve overlaps, merge, grade. */

export function sessionDrafts(sessions: readonly Session[]): BlockDraft[] {
  return sessions.map((session) => ({
    start: session.start,
    end: session.end,
    clientId: session.clientId,
    origin: 'git-session' as const,
    evidenceIds: session.points.map((point) => point.evidence.id),
    assumedLeadInMinutes: session.assumedLeadInMinutes,
  }));
}

/** Meetings and manual entries are exact spans: they become drafts as they are. */
export function spanDrafts(evidence: readonly Evidence[], origin: 'meeting' | 'manual'): BlockDraft[] {
  const drafts: BlockDraft[] = [];
  for (const item of evidence) {
    if (typeof item.start !== 'number' || typeof item.end !== 'number') continue;
    if (item.end <= item.start) continue;
    drafts.push({
      start: item.start,
      end: item.end,
      clientId: item.clientId ?? '',
      origin,
      evidenceIds: [item.id],
      assumedLeadInMinutes: 0,
    });
  }
  return drafts;
}

export function draftInterval(draft: BlockDraft): Interval {
  return makeInterval(draft.start, draft.end);
}

/** Proof intervals of a session: consecutive proofs define proven work. */
export function proofIntervals(points: readonly PointProof[]): Interval[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const intervals: Interval[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const from = sorted[i - 1];
    const to = sorted[i];
    if (!from || !to || to.at <= from.at) continue;
    intervals.push(makeInterval(from.at, to.at));
  }
  return nonEmptyIntervals(intervals);
}

/** Proofs of one client that fall strictly inside a span of another client. */
export function pointsInside(points: readonly PointProof[], span: Interval): PointProof[] {
  return points.filter((point) => point.at > span.start && point.at < span.end);
}

export interface TrimResult {
  readonly drafts: BlockDraft[];
  /** Proofs of the removed remainder, listed rather than lost. */
  readonly leftover: Evidence[];
}

/**
 * Step 7: a meeting of another client trims a session. A meeting has known
 * bounds, a lead-in is only assumed, so the meeting wins — unless the session
 * holds a proof inside the meeting, which is a contradiction the user must
 * arbitrate (handled by the caller before trimming).
 */
export function trimSession(
  draft: BlockDraft,
  points: readonly PointProof[],
  removals: readonly Interval[],
  minMs: number,
): TrimResult {
  const pieces = subtractAll(draftInterval(draft), removals);
  const kept: BlockDraft[] = [];
  const leftover: Evidence[] = [];
  const assigned = new Set<string>();
  for (const piece of pieces) {
    const inside = points.filter((point) => point.at >= piece.start && point.at <= piece.end);
    for (const point of inside) assigned.add(point.evidence.id);
    // No proof inside and too short: nothing to propose, nothing to lose.
    if (durationMs(piece) < minMs || inside.length === 0) {
      leftover.push(...inside.map((point) => point.evidence));
      continue;
    }
    const startsAtOriginal = piece.start === draft.start;
    kept.push({
      ...draft,
      start: piece.start,
      end: piece.end,
      evidenceIds: inside.map((point) => point.evidence.id),
      assumedLeadInMinutes: startsAtOriginal ? draft.assumedLeadInMinutes : 0,
    });
  }
  // A proof sitting exactly on the boundary of a removed span belongs to no
  // piece: it is reported as a leftover rather than silently dropped.
  for (const point of points) {
    if (!assigned.has(point.evidence.id)) leftover.push(point.evidence);
  }
  return { drafts: kept, leftover };
}

/** Step 8: a meeting and a session of the same client that touch become one. */
export function mergeSameClient(drafts: readonly BlockDraft[]): BlockDraft[] {
  const merged: BlockDraft[] = [];
  const byClient = new Map<string, BlockDraft[]>();
  for (const draft of drafts) {
    const list = byClient.get(draft.clientId) ?? [];
    list.push(draft);
    byClient.set(draft.clientId, list);
  }
  for (const clientId of [...byClient.keys()].sort()) {
    const list = (byClient.get(clientId) ?? []).sort((a, b) => a.start - b.start || a.end - b.end);
    let current: BlockDraft | null = null;
    for (const draft of list) {
      if (current && draft.start <= current.end) {
        current = {
          start: current.start,
          end: Math.max(current.end, draft.end),
          clientId,
          origin: 'merged',
          evidenceIds: [...new Set([...current.evidenceIds, ...draft.evidenceIds])],
          assumedLeadInMinutes: current.assumedLeadInMinutes,
        };
        continue;
      }
      if (current) merged.push(current);
      current = draft;
    }
    if (current) merged.push(current);
  }
  return merged.sort((a, b) => a.start - b.start || a.clientId.localeCompare(b.clientId));
}

/** Share of the block covered by hard proof, in [0, 1]. */
export function provenShareOf(draft: BlockDraft, proof: readonly Interval[]): number {
  if (draft.end <= draft.start) return 0;
  const covered = union(proof.map((interval) => clamp(interval, draftInterval(draft))));
  return coverageRatio(covered, draftInterval(draft));
}

function clamp(interval: Interval, bounds: Interval): Interval {
  const start = Math.max(interval.start, bounds.start);
  const end = Math.min(interval.end, bounds.end);
  return makeInterval(start, Math.max(start, end));
}

export interface FinaliseInput {
  readonly drafts: readonly BlockDraft[];
  readonly proofByClient: ReadonlyMap<string, readonly Interval[]>;
  readonly conflictBlockKeys: ReadonlySet<string>;
  readonly adjustedBlocks?: readonly Block[];
}

export function draftKey(draft: BlockDraft): string {
  return blockId(draft.start, draft.end, draft.clientId, draft.origin);
}

/** Step 9: confidence, status and the final `Block` shape. */
export function finalise(input: FinaliseInput): Block[] {
  const blocks: Block[] = [];
  for (const draft of input.drafts) {
    const key = draftKey(draft);
    const proof = input.proofByClient.get(draft.clientId) ?? [];
    const manual = draft.origin === 'manual';
    const share = manual ? 0 : provenShareOf(draft, proof);
    blocks.push({
      id: key,
      start: draft.start,
      end: draft.end,
      clientId: draft.clientId,
      projectId: null,
      status: manual ? 'proposed' : input.conflictBlockKeys.has(key) ? 'conflict' : 'proposed',
      origin: draft.origin,
      provenShare: share,
      confidence: manual ? 'to-confirm' : confidenceOf(share * 1000, 1000),
      assumedLeadInMinutes: draft.assumedLeadInMinutes,
      evidenceIds: [...draft.evidenceIds],
      locked: false,
      adjusted: false,
      ...(manual ? { note: 'declared by the user' } : {}),
    });
  }
  return blocks;
}

/** Thresholds of D.5 step 9: 0.8 and 0.5 of proven share. */
export function confidenceOf(provenMs: number, totalMs: number): 'solid' | 'likely' | 'to-confirm' {
  if (totalMs <= 0) return 'to-confirm';
  const share = provenMs / totalMs;
  if (share >= 0.8) return 'solid';
  if (share >= 0.5) return 'likely';
  return 'to-confirm';
}

export function totalProvenMs(intervals: readonly Interval[]): number {
  return totalDurationMs(intervals);
}

export type { Instant, ReconstructionSettings };
