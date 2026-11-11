import type {
  Block,
  Conflict,
  Evidence,
  Instant,
  Minutes,
  ReconstructionResult,
  ReconstructionSettings,
} from '@ghost-hours/core';
import { conflictId, minutesToMs } from '@ghost-hours/core';
import { makeInterval, overlaps, type Interval } from '@ghost-hours/intervals';
import {
  draftKey,
  finalise,
  mergeSameClient,
  pointsInside,
  proofIntervals,
  sessionDrafts,
  spanDrafts,
  trimSession,
  type TrimResult,
} from './blocks.ts';
import { buildSessions, toPoint } from './sessions.ts';
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

export function sessionize(input: SessionizeInput): SessionizeResult {
  const frozen = new Set([...(input.lockedBlocks ?? []), ...(input.adjustedBlocks ?? [])].flatMap((b) => b.evidenceIds));
  // Re-importing the same file must not double anything: ids are the identity.
  const seen = new Set<string>();
  const unique = input.evidence.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  const pool = unique.filter((item) => !frozen.has(item.id));
  const mapped = pool.filter((item) => item.clientId !== null);
  const orphans: Evidence[] = pool.filter((item) => item.clientId === null);
  const points = mapped.map(toPoint).filter((point): point is PointProof => point !== null);
  const checkouts = mapped.filter((item) => item.kind === 'checkout');
  const meetings = mapped.filter((item) => item.kind === 'meeting');
  const manuals = mapped.filter((item) => item.kind === 'manual');

  const built = buildSessions(points, checkouts, input.settings);
  orphans.push(...built.tooShort.map((point) => point.evidence));
  const pointsBySession = new Map<string, readonly PointProof[]>();
  const sessions = sessionDrafts(built.sessions);
  built.sessions.forEach((session, index) => {
    const draft = sessions[index];
    if (draft) pointsBySession.set(draftKey(draft), session.points);
  });

  const meetingDrafts = spanDrafts(meetings, 'meeting');
  const manualDrafts = spanDrafts(manuals, 'manual');
  const contradictions = findContradictions(sessions, pointsBySession, meetingDrafts);
  const conflictKeys = new Set<string>([...contradictions.sessionKeys, ...contradictions.meetingKeys]);

  const trimmed = trimNonConflicting(sessions, pointsBySession, meetingDrafts, conflictKeys, input.settings);
  orphans.push(...trimmed.leftover);
  const merged = mergeSameClient([...trimmed.drafts, ...meetingDrafts, ...manualDrafts]);
  const proofByClient = proofIndex(points, meetingDrafts);
  const fresh = finalise({
    drafts: merged,
    proofByClient,
    conflictBlockKeys: conflictKeys,
    adjustedBlocks: input.adjustedBlocks,
  });
  const blocks = sortBlocks([...(input.lockedBlocks ?? []), ...(input.adjustedBlocks ?? []), ...fresh]);
  return {
    blocks,
    conflicts: buildConflicts(contradictions.pairs),
    orphanEvidence: orphans.sort(
      (a, b) => (a.at ?? a.start ?? 0) - (b.at ?? b.start ?? 0) || a.id.localeCompare(b.id),
    ),
    settings: input.settings,
    calibration: calibrate(input.corrections ?? [], input.settings),
  } satisfies ReconstructionResult & { calibration: ReturnType<typeof calibrate> };
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
  // Meetings have known bounds: they are placed first, in time order.
  const occupied: Interval[] = cleanMeetings.map((meeting) => makeInterval(meeting.start, meeting.end));
  const ordered = [...sessions].sort((a, b) => a.start - b.start || a.clientId.localeCompare(b.clientId) || a.end - b.end);
  for (const session of ordered) {
    if (conflictKeys.has(draftKey(session))) {
      drafts.push(session);
      continue;
    }
    const removals = occupied.filter((span) => overlaps(span, makeInterval(session.start, session.end)));
    const result: TrimResult = trimSession(session, pointsBySession.get(draftKey(session)) ?? [], removals, minMs);
    drafts.push(...result.drafts);
    leftover.push(...result.leftover);
    // What this session keeps is taken: a later session cannot claim it.
    for (const draft of result.drafts) occupied.push(makeInterval(draft.start, draft.end));
  }
  return { drafts, leftover };
}

function proofIndex(
  points: readonly PointProof[],
  meetings: readonly BlockDraft[],
): ReadonlyMap<string, readonly Interval[]> {
  const byClient = new Map<string, PointProof[]>();
  for (const point of points) {
    const clientId = point.evidence.clientId ?? '';
    const list = byClient.get(clientId) ?? [];
    list.push(point);
    byClient.set(clientId, list);
  }
  const index = new Map<string, Interval[]>();
  for (const [clientId, own] of byClient) index.set(clientId, proofIntervals(own));
  for (const meeting of meetings) {
    const list = index.get(meeting.clientId) ?? [];
    list.push(makeInterval(meeting.start, meeting.end));
    index.set(meeting.clientId, list);
  }
  return index;
}

function buildConflicts(pairs: readonly Contradiction[]): Conflict[] {
  return pairs
    .map((pair) => {
      const blockIds = [...(pair.sessionKey ? [pair.sessionKey] : []), ...pair.meetingKeys];
      return {
        id: conflictId(pair.start, pair.end, blockIds),
        start: pair.start,
        end: pair.end,
        blockIds,
        evidenceIds: [...pair.evidenceIds],
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
