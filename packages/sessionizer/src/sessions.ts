import type { Evidence, Instant, ReconstructionSettings } from '@ghost-hours/core';
import { minutesToMs, parseClock, zonedParts, zonedTimeToInstant } from '@ghost-hours/core';
import type { PointProof, Session } from './types.ts';

/**
 * Step 1 to 5 of D.5: normalise, group per client, cut into sessions, then fix
 * the start (checkout marker or assumed lead-in) and the end of each session.
 *
 * The lead-in is the only invented minutes in the whole product, so it is
 * bounded three times: by `leadInMaxMinutes` (how far back a checkout may be
 * searched), by the previous proof of any client (work cannot start before the
 * previous piece of work ended), and by `workdayStart` (a session never begins
 * before the working day). What remains is reported as `assumedLeadInMinutes`.
 */

/** Evidence that marks an instant: a commit or a note. */
export function isPointEvidence(evidence: Evidence): boolean {
  return (evidence.kind === 'commit' || evidence.kind === 'note') && typeof evidence.at === 'number';
}

export function toPoint(evidence: Evidence): PointProof | null {
  return isPointEvidence(evidence) ? { evidence, at: evidence.at as Instant } : null;
}

export function comparePoints(a: PointProof, b: PointProof): number {
  if (a.at !== b.at) return a.at - b.at;
  return a.evidence.id < b.evidence.id ? -1 : a.evidence.id > b.evidence.id ? 1 : 0;
}

/** `workdayStart` of the day containing `instant`, in the settings' zone. */
export function workdayStartAt(instant: Instant, settings: ReconstructionSettings): Instant {
  const minutes = parseClock(settings.workdayStart) ?? 0;
  const { year, month, day } = zonedParts(instant, settings.timeZone);
  return zonedTimeToInstant(
    { year, month, day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    settings.timeZone,
  );
}

/** Cut one client's sorted proofs into runs separated by more than `gapMax`. */
export function splitIntoRuns(points: readonly PointProof[], gapMs: number): PointProof[][] {
  const runs: PointProof[][] = [];
  let current: PointProof[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && point.at - previous.at > gapMs) {
      runs.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export interface StartResolution {
  readonly start: Instant;
  readonly assumedLeadInMinutes: number;
}

/**
 * Step 4: a checkout of the same repository inside `leadInMax`, after the
 * previous proof of any client, is the real start; otherwise the first proof
 * minus `leadInDefault`, clamped by the previous proof and by `workdayStart`.
 */
export function resolveStart(
  firstProofAt: Instant,
  repo: string | null,
  previousProofAt: Instant | null,
  checkouts: readonly Evidence[],
  settings: ReconstructionSettings,
): StartResolution {
  const floor = Math.max(previousProofAt ?? Number.NEGATIVE_INFINITY, workdayStartAt(firstProofAt, settings));
  const marker = latestCheckout(firstProofAt, repo, checkouts, settings, floor);
  if (marker !== null) return { start: marker, assumedLeadInMinutes: 0 };
  const assumed = firstProofAt - minutesToMs(settings.leadInDefaultMinutes);
  const start = Math.max(assumed, floor);
  if (start >= firstProofAt) return { start: firstProofAt, assumedLeadInMinutes: 0 };
  return { start, assumedLeadInMinutes: (firstProofAt - start) / 60_000 };
}

function latestCheckout(
  firstProofAt: Instant,
  repo: string | null,
  checkouts: readonly Evidence[],
  settings: ReconstructionSettings,
  floor: Instant,
): Instant | null {
  if (!repo) return null;
  const windowStart = Math.max(firstProofAt - minutesToMs(settings.leadInMaxMinutes), floor);
  let best: Instant | null = null;
  for (const checkout of checkouts) {
    const at = checkout.at;
    if (typeof at !== 'number' || checkout.repo !== repo) continue;
    if (at < windowStart || at >= firstProofAt) continue;
    if (best === null || at > best) best = at;
  }
  return best;
}

export interface SessionBuild {
  readonly sessions: readonly Session[];
  /** Proofs of a run shorter than `minSessionMinutes`: listed, never billed. */
  readonly tooShort: readonly PointProof[];
}

/** Steps 2 to 5 for every client at once. */
export function buildSessions(
  points: readonly PointProof[],
  checkouts: readonly Evidence[],
  settings: ReconstructionSettings,
): SessionBuild {
  const sorted = [...points].sort(comparePoints);
  const gapMs = minutesToMs(settings.gapMaxMinutes);
  const minMs = minutesToMs(settings.minSessionMinutes);
  const tailMs = minutesToMs(settings.tailMinutes);
  const sessions: Session[] = [];
  const tooShort: PointProof[] = [];
  for (const clientId of [...new Set(sorted.map((p) => p.evidence.clientId ?? ''))].sort()) {
    const own = sorted.filter((p) => (p.evidence.clientId ?? '') === clientId);
    for (const run of splitIntoRuns(own, gapMs)) {
      const first = run[0];
      if (!first) continue;
      const start = resolveStart(first.at, first.evidence.repo ?? null, previousProofAt(sorted, first.at), checkouts, settings);
      const end = (run[run.length - 1]?.at ?? first.at) + tailMs;
      if (end - start.start < minMs) {
        tooShort.push(...run);
        continue;
      }
      sessions.push({
        clientId,
        repo: first.evidence.repo ?? null,
        start: start.start,
        end,
        assumedLeadInMinutes: start.assumedLeadInMinutes,
        points: run,
      });
    }
  }
  return { sessions: sessions.sort((a, b) => a.start - b.start), tooShort };
}

/** The last proof strictly before `at`, all clients considered. */
function previousProofAt(sorted: readonly PointProof[], at: Instant): Instant | null {
  let best: Instant | null = null;
  for (const point of sorted) {
    if (point.at >= at) break;
    if (best === null || point.at > best) best = point.at;
  }
  return best;
}
