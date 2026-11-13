import type {
  Block,
  Conflict,
  Evidence,
  Instant,
  Minutes,
  ReconstructionSettings,
} from '@ghost-hours/core';
import { conflictId, minutesToMs } from '@ghost-hours/core';
import { makeInterval, overlaps, type Interval } from '@ghost-hours/intervals';
import {
  compareDrafts,
  draftKey,
  finalise,
  removeOverlaps,
  mergeSameClient,
  pointsInside,
  proofIntervals,
  sessionDrafts,
  spanDrafts,
  trimSession,
  type TrimResult,
} from './blocks.ts';
import { buildSessions, toPoint } from './sessions.ts';
import { partitionAutomation } from './noise.ts';
import type { BlockDraft, PointProof } from './types.ts';
import { calibrate } from './calibration.ts';
import type { SessionizeInput, SessionizeResult } from './public-types.ts';

/**
 * The nine steps of D.5, in order.
 *
 * Decisions that the specification leaves open, and why:
 *
 * 1. **Notes are proofs.** A note with a timestamp marks an instant of work,
 *    exactly like a commit; it is weaker evidence in practice, which the
 *    confidence level shows, but it is what lets a consultant whose day is
 *    half meetings see anything at all.
 * 2. **A checkout is never a block.** It proves when work *started*, not that
 *    work happened, so it can only set a session start.
 * 3. **A proof inside another client's meeting is a conflict, not a guess.**
 *    Two exact things contradict each other; only the human can arbitrate.
 * 4. **A meeting trims an assumed lead-in without asking.** One side has known
 *    bounds, the other is invented: the known one wins.
 * 5. **A session shorter than `minSessionMinutes` is dropped**, but its proofs
 *    are listed as leftovers instead of disappearing (D.15: nothing silent).
 * 6. **Manual entries are `to-confirm` with a proven share of 0.** They are
 *    declared, not proven; the user still confirms them.
 */

interface Pool {
  readonly ignored: readonly Evidence[];
  readonly mapped: readonly Evidence[];
  readonly orphans: readonly Evidence[];
  readonly points: readonly PointProof[];
  readonly checkouts: readonly Evidence[];
  readonly meetings: readonly Evidence[];
  readonly manuals: readonly Evidence[];
}

/** Steps 1-2: dedupe, drop what the user already decided, split by client. */
function partition(input: SessionizeInput): { pool: Pool; unique: readonly Evidence[] } {
  const frozen = new Set(
    [...(input.lockedBlocks ?? []), ...(input.adjustedBlocks ?? [])].flatMap((block) => block.evidenceIds),
  );
  const seen = new Set<string>();
  const unique = input.evidence.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  const unfrozen = unique.filter((item) => !frozen.has(item.id));
  // Automation is set aside before anything is counted, and reported (never
  // hidden): a bot's commits are not the freelancer's hours.
  const split = input.settings.ignoreAutomation === false ? { kept: unfrozen, ignored: [] } : partitionAutomation(unfrozen);
  const kept = split.kept;
  const mapped = kept.filter((item) => item.clientId !== null);
  return {
    unique,
    pool: {
      ignored: split.ignored,
      mapped,
      orphans: kept.filter((item) => item.clientId === null),
      points: mapped.map(toPoint).filter((point): point is PointProof => point !== null),
      checkouts: mapped.filter((item) => item.kind === 'checkout'),
      meetings: mapped.filter((item) => item.kind === 'meeting'),
      manuals: mapped.filter((item) => item.kind === 'manual'),
    },
  };
}

export interface Reconstruction {
  readonly blocks: readonly Block[];
  readonly conflicts: readonly Conflict[];
  readonly leftovers: readonly Evidence[];
  readonly ignored: readonly Evidence[];
}

/** Steps 3-9: sessions, meetings, contradictions, trimming, merging, grading. */
function reconstruct(
  pool: Pool,
  unique: readonly Evidence[],
  settings: ReconstructionSettings,
  adjustedBlocks?: readonly Block[],
): Reconstruction {
  const built = buildSessions(pool.points, pool.checkouts, settings);
  const sessions = sessionDrafts(built.sessions);
  const pointsBySession = new Map<string, readonly PointProof[]>();
  built.sessions.forEach((session, index) => {
    const draft = sessions[index];
    if (draft) pointsBySession.set(draftKey(draft), session.points);
  });

  const meetingDrafts = spanDrafts(pool.meetings, 'meeting').sort(compareDrafts);
  const manualDrafts = spanDrafts(pool.manuals, 'manual').sort(compareDrafts);
  const contradictions = findContradictions(sessions, pointsBySession, meetingDrafts);
  const conflictKeys = new Set<string>([...contradictions.sessionKeys, ...contradictions.meetingKeys]);
  const flaggedMeetings = meetingDrafts.map((draft) =>
    conflictKeys.has(draftKey(draft)) ? { ...draft, conflicted: true } : draft,
  );

  const trimmed = trimNonConflicting(sessions, pointsBySession, flaggedMeetings, conflictKeys, settings);
  // A contradiction is never merged away: it keeps its own block, and the work
  // around it is cut around the contradiction.
  const conflictedDrafts = [...trimmed.drafts, ...flaggedMeetings].filter((draft) => draft.conflicted === true);
  const mergeable = [
    ...trimmed.drafts.filter((draft) => draft.conflicted !== true),
    ...flaggedMeetings.filter((draft) => draft.conflicted !== true),
    ...manualDrafts,
  ];
  const evidenceById = new Map<string, Evidence>(unique.map((item) => [item.id, item]));
  const settled = removeOverlaps([...mergeSameClient(mergeable), ...conflictedDrafts], evidenceById);
  const proofByDraft = new Map<string, readonly Interval[]>();
  for (const draft of settled.drafts) proofByDraft.set(draftKey(draft), proofOfDraft(draft, evidenceById));

  return {
    blocks: finalise({ drafts: settled.drafts, proofByDraft, conflictBlockKeys: conflictKeys, adjustedBlocks }),
    conflicts: buildConflicts(contradictions.pairs, constituentIndex(settled.drafts)),
    leftovers: [...built.tooShort.map((point) => point.evidence), ...trimmed.leftover, ...settled.leftover],
    ignored: pool.ignored,
  };
}

export function sessionize(input: SessionizeInput): SessionizeResult {
  const { pool, unique } = partition(input);
  const outcome = reconstruct(pool, unique, input.settings, input.adjustedBlocks);
  const orphans = [...pool.orphans, ...outcome.leftovers].sort(
    (a, b) => (a.at ?? a.start ?? 0) - (b.at ?? b.start ?? 0) || a.id.localeCompare(b.id),
  );
  const blocks = sortBlocks([
    ...(input.lockedBlocks ?? []),
    ...(input.adjustedBlocks ?? []),
    ...outcome.blocks,
  ]);
  return {
    blocks,
    conflicts: outcome.conflicts,
    orphanEvidence: orphans,
    ignoredEvidence: outcome.ignored,
    settings: input.settings,
    calibration: calibrate(input.corrections ?? [], input.settings),
  };
}

interface Contradiction {
  readonly sessionKey: string | null;
  readonly meetingKeys: readonly string[];
  readonly start: Instant;
  readonly end: Instant;
  readonly evidenceIds: readonly string[];
  readonly reason: string;
}

interface ContradictionScan {
  readonly pairs: readonly Contradiction[];
  readonly sessionKeys: ReadonlySet<string>;
  readonly meetingKeys: ReadonlySet<string>;
}

function findContradictions(
  sessions: readonly BlockDraft[],
  pointsBySession: ReadonlyMap<string, readonly PointProof[]>,
  meetings: readonly BlockDraft[],
): ContradictionScan {
  const pairs: Contradiction[] = [];
  const sessionKeys = new Set<string>();
  const meetingKeys = new Set<string>();
  for (const session of sessions) {
    const points = pointsBySession.get(draftKey(session)) ?? [];
    for (const meeting of meetings) {
      if (meeting.clientId === session.clientId) continue;
      const inside = pointsInside(points, makeInterval(meeting.start, meeting.end));
      if (inside.length === 0) continue;
      sessionKeys.add(draftKey(session));
      meetingKeys.add(draftKey(meeting));
      pairs.push({
        sessionKey: draftKey(session),
        meetingKeys: [draftKey(meeting)],
        start: Math.max(session.start, meeting.start),
        end: Math.min(session.end, meeting.end),
        evidenceIds: inside.map((point) => point.evidence.id),
        reason: `proof of ${session.clientId} falls inside a meeting of ${meeting.clientId}`,
      });
    }
  }
  pairs.push(...sessionContradictions(sessions, pointsBySession));
  pairs.push(...meetingContradictions(meetings));
  for (const pair of pairs) for (const key of pair.meetingKeys) meetingKeys.add(key);
  return { pairs, sessionKeys, meetingKeys };
}

/**
 * Two Git sessions of different clients may overlap — an assumed lead-in can
 * reach into the other client's work. That is tolerated and trimmed (the
 * earlier session wins). But when a *proof* of one client falls inside the
 * other client's session, the evidence contradicts itself and only the user
 * can arbitrate: that is a conflict, never a silent choice.
 */
function sessionContradictions(
  sessions: readonly BlockDraft[],
  pointsBySession: ReadonlyMap<string, readonly PointProof[]>,
): Contradiction[] {
  const found: Contradiction[] = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (!a || !b || a.clientId === b.clientId) continue;
      const spanA = makeInterval(a.start, a.end);
      const spanB = makeInterval(b.start, b.end);
      if (!overlaps(spanA, spanB)) continue;
      const inside =
        pointsInside(pointsBySession.get(draftKey(b)) ?? [], spanA).length +
        pointsInside(pointsBySession.get(draftKey(a)) ?? [], spanB).length;
      if (inside === 0) continue;
      found.push({
        sessionKey: draftKey(a),
        meetingKeys: [draftKey(b)],
        start: Math.max(a.start, b.start),
        end: Math.min(a.end, b.end),
        evidenceIds: [
          ...pointsInside(pointsBySession.get(draftKey(b)) ?? [], spanA).map((point) => point.evidence.id),
          ...pointsInside(pointsBySession.get(draftKey(a)) ?? [], spanB).map((point) => point.evidence.id),
        ],
        reason: `proofs of ${a.clientId} and ${b.clientId} claim the same minutes`,
      });
    }
  }
  return found;
}

function meetingContradictions(meetings: readonly BlockDraft[]): Contradiction[] {
  const found: Contradiction[] = [];
  for (let i = 0; i < meetings.length; i += 1) {
    for (let j = i + 1; j < meetings.length; j += 1) {
      const a = meetings[i];
      const b = meetings[j];
      if (!a || !b || a.clientId === b.clientId) continue;
      if (!overlaps(makeInterval(a.start, a.end), makeInterval(b.start, b.end))) continue;
      found.push({
        sessionKey: null,
        meetingKeys: [draftKey(a), draftKey(b)],
        start: Math.max(a.start, b.start),
        end: Math.min(a.end, b.end),
        evidenceIds: [...a.evidenceIds, ...b.evidenceIds],
        reason: `two meetings of different clients overlap (${a.clientId} / ${b.clientId})`,
      });
    }
  }
  return found;
}

interface TrimAll {
  readonly drafts: readonly BlockDraft[];
  readonly leftover: readonly Evidence[];
}

function trimNonConflicting(
  sessions: readonly BlockDraft[],
  pointsBySession: ReadonlyMap<string, readonly PointProof[]>,
  meetings: readonly BlockDraft[],
  conflictKeys: ReadonlySet<string>,
  settings: ReconstructionSettings,
): TrimAll {
  const drafts: BlockDraft[] = [];
  const leftover: Evidence[] = [];
  const minMs = minutesToMs(settings.minSessionMinutes);
  const cleanMeetings = meetings.filter((meeting) => !conflictKeys.has(draftKey(meeting)));
  // Meetings have known bounds: they are placed first, in time order. Only
  // another client's meeting may trim a session — a meeting of the same
  // client is merged with it, not cut out of it.
  const occupied: { clientId: string; span: Interval }[] = cleanMeetings.map((meeting) => ({
    clientId: meeting.clientId,
    span: makeInterval(meeting.start, meeting.end),
  }));
  const ordered = [...sessions].sort((a, b) => a.start - b.start || a.clientId.localeCompare(b.clientId) || a.end - b.end);
  for (const session of ordered) {
    if (conflictKeys.has(draftKey(session))) {
      drafts.push({ ...session, conflicted: true });
      continue;
    }
    const removals = occupied
      .filter((entry) => entry.clientId !== session.clientId)
      .map((entry) => entry.span)
      .filter((span) => overlaps(span, makeInterval(session.start, session.end)));
    const result: TrimResult = trimSession(session, pointsBySession.get(draftKey(session)) ?? [], removals, minMs);
    drafts.push(...result.drafts);
    leftover.push(...result.leftover);
    // What this session keeps is taken: a later session cannot claim it.
    for (const draft of result.drafts) {
      occupied.push({ clientId: session.clientId, span: makeInterval(draft.start, draft.end) });
    }
  }
  return { drafts, leftover };
}

/**
 * The proven part of a block: the intervals between its own consecutive proofs,
 * plus the spans of the meetings it contains. The gap between two blocks is
 * never proof — a night is not work.
 */
function proofOfDraft(draft: BlockDraft, evidenceById: ReadonlyMap<string, Evidence>): Interval[] {
  const points: PointProof[] = [];
  const spans: Interval[] = [];
  for (const id of draft.evidenceIds) {
    const item = evidenceById.get(id);
    if (!item) continue;
    if (typeof item.at === 'number') points.push({ evidence: item, at: item.at });
    else if (typeof item.start === 'number' && typeof item.end === 'number') {
      spans.push(makeInterval(item.start, item.end));
    }
  }
  return [...proofIntervals(points), ...spans];
}

/** Every draft key (including merged-away ones) points at the block that kept it. */
function constituentIndex(merged: readonly BlockDraft[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const draft of merged) {
    const key = draftKey(draft);
    index.set(key, key);
    for (const constituent of draft.constituents ?? []) index.set(constituent, key);
  }
  return index;
}

function buildConflicts(
  pairs: readonly Contradiction[],
  index: ReadonlyMap<string, string>,
): Conflict[] {
  const resolve = (key: string | null): string | null => (key ? (index.get(key) ?? key) : null);
  return pairs
    .map((pair) => {
      const blockIds = [resolve(pair.sessionKey), ...pair.meetingKeys.map(resolve)].filter(
        (id): id is string => id !== null,
      );
      return {
        id: conflictId(pair.start, pair.end, blockIds),
        start: pair.start,
        end: pair.end,
        blockIds: [...new Set(blockIds)].sort(),
        evidenceIds: [...pair.evidenceIds].sort(),
        reason: pair.reason,
        resolved: false,
      } satisfies Conflict;
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

function sortBlocks(blocks: readonly Block[]): Block[] {
  return [...blocks].sort((a, b) => a.start - b.start || a.clientId.localeCompare(b.clientId) || a.id.localeCompare(b.id));
}

export type { Minutes };
