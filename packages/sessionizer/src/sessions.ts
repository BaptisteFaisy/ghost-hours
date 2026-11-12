import type { Evidence, Instant, Minutes, ReconstructionSettings } from '@ghost-hours/core';
import { minutesToMs, msToMinutes, parseClock, zonedParts, zonedTimeToInstant } from '@ghost-hours/core';
import type { PointProof, Session } from './types.ts';

/**
 * Steps 1 to 5 of D.5: normalise, group per client, cut into sessions, then
 * fix the start and the end of each session.
 *
 * Two thresholds, two meanings:
 *
 * - a gap longer than `gapMaxMinutes` ends the working session: the next one
 *   gets an **assumed lead-in**, because work probably started before its first
 *   proof (the morning commit is the tip of an hour of reading);
 * - a gap longer than `breakMaxMinutes` but shorter than `gapMaxMinutes` is a
 *   **pause inside the day** (lunch, a call): the session is cut, and nothing
 *   is assumed before it resumes, because a pause is not work.
 *
 * The lead-in is the only invented minutes in the whole product, so it stays
 * bounded three times: by `leadInMaxMinutes`, by the previous proof of any
 * client, and by `workdayStart`.
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

/** A run of proofs, and the pause that separates it from the previous one. */
export interface Run {
  readonly points: readonly PointProof[];
  /** Minutes of pause before this run; 0 when a full gap opened a new session. */
  readonly pauseMinutes: Minutes;
}

/** Cut one client's sorted proofs on `gapMax` (new session) and `breakMax` (pause). */
export function splitIntoRuns(points: readonly PointProof[], gapMs: number, breakMs: number): Run[] {
  const runs: Run[] = [];
  let current: PointProof[] = [];
  // Pause that precedes `current`: zero for the first run of a client, and for
  // any run opened by a full gap (a new session may assume a lead-in).
  let pause: Minutes = 0;
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous) {
      const gap = point.at - previous.at;
      if (gap > gapMs) {
        runs.push({ points: current, pauseMinutes: pause });
        current = [];
        pause = 0;
      } else if (gap > breakMs) {
        runs.push({ points: current, pauseMinutes: pause });
        current = [];
        pause = msToMinutes(gap);
      }
    }
    current.push(point);
  }
  if (current.length > 0) runs.push({ points: current, pauseMinutes: pause });
  return runs;
}

export interface StartResolution {
  readonly start: Instant;
  readonly assumedLeadInMinutes: Minutes;
  readonly startKind: 'checkout' | 'assumed';
  /** `day-cap`: the day already spent its assumed start, so this one assumes nothing. */
  readonly boundedBy: 'previous-proof' | 'workday-start' | 'none' | 'day-cap';
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
  const workday = workdayStartAt(firstProofAt, settings);
  const floor = Math.max(previousProofAt ?? Number.NEGATIVE_INFINITY, workday);
  const marker = latestCheckout(firstProofAt, repo, checkouts, settings, floor);
  if (marker !== null) {
    return { start: marker, assumedLeadInMinutes: 0, startKind: 'checkout', boundedBy: 'none' };
  }
  const assumed = firstProofAt - minutesToMs(settings.leadInDefaultMinutes);
  const start = Math.max(assumed, floor);
  if (start >= firstProofAt) {
    return { start: firstProofAt, assumedLeadInMinutes: 0, startKind: 'assumed', boundedBy: boundOf(firstProofAt, 0, settings, previousProofAt, workday) };
  }
  const leadIn = msToMinutes(firstProofAt - start);
  return {
    start,
    assumedLeadInMinutes: leadIn,
    startKind: 'assumed',
    boundedBy: boundOf(firstProofAt, leadIn, settings, previousProofAt, workday),
  };
}

/** Which constraint shortened the lead-in, if any did. */
function boundOf(
  firstProofAt: Instant,
  leadIn: Minutes,
  settings: ReconstructionSettings,
  previousProofAt: Instant | null,
  workday: Instant,
): 'previous-proof' | 'workday-start' | 'none' {
  if (leadIn >= settings.leadInDefaultMinutes) return 'none';
  const previousIsLater = previousProofAt !== null && previousProofAt >= workday;
  if (previousIsLater && firstProofAt - (previousProofAt as Instant) <= minutesToMs(leadIn) + 1) {
    return 'previous-proof';
  }
  return previousIsLater ? 'previous-proof' : 'workday-start';
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
  const breakMs = minutesToMs(Math.min(settings.breakMaxMinutes, settings.gapMaxMinutes));
  const minMs = minutesToMs(settings.minSessionMinutes);
  const tailMs = minutesToMs(settings.tailMinutes);
  const sessions: Session[] = [];
  const tooShort: PointProof[] = [];
  // The day's assumed budget (idea: the anti-inflation rule).
  //
  // The assumed lead-in answers "you were working before your first commit".
  // That is a fair question; asked again after every break, it becomes a way
  // to add time — commit every ninety minutes and each session collects its
  // own thirty minutes of invented morning. So the day has a budget: the
  // assumed minutes of that day may not exceed one full lead-in
  // (`leadInMaxMinutes`). A normal day with a long break keeps both of its
  // lead-ins (30 + 30 = 60, under the budget); a day farmed with commits
  // loses the excess. The day may be under-counted; it is never over-counted.
  const assumedByDay = new Map<string, Minutes>();
  for (const clientId of clientIdsOf(sorted)) {
    const own = sorted.filter((point) => (point.evidence.clientId ?? '') === clientId);
    for (const run of splitIntoRuns(own, gapMs, breakMs)) {
      const built = toSession(run, clientId, sorted, checkouts, settings, minMs, tailMs);
      if (built === null) {
        tooShort.push(...run.points);
        continue;
      }
      const session = capAssumption(built, assumedByDay, settings, minMs);
      if (session === null) tooShort.push(...run.points);
      else sessions.push(session);
    }
  }
  return { sessions: sessions.sort((a, b) => a.start - b.start), tooShort };
}

function clientIdsOf(sorted: readonly PointProof[]): string[] {
  return [...new Set(sorted.map((point) => point.evidence.clientId ?? ''))].sort();
}

/**
 * The day a session belongs to: the day of its **first proof**, not of its
 * start. An assumed lead-in can push the start before midnight, and the day
 * that owns the work is the day the work was proved.
 */
function dayOfProof(session: Session, settings: ReconstructionSettings): string {
  const instant = session.points[0]?.at ?? session.start;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/**
 * Spend the day's assumed budget, and give back what does not fit.
 *
 * A session whose assumed start is cut may fall under the minimum session
 * length: it is then returned as `null`, and its proofs are listed as too
 * short — listed, never billed (the product's rule for proofs that stand
 * alone).
 */
function capAssumption(
  session: Session,
  assumedByDay: Map<string, Minutes>,
  settings: ReconstructionSettings,
  minMs: number,
): Session | null {
  if (session.assumedLeadInMinutes <= 0) return session;
  const day = dayOfProof(session, settings);
  const spent = assumedByDay.get(day) ?? 0;
  const remaining = Math.max(0, settings.leadInMaxMinutes - spent);
  const granted = Math.min(session.assumedLeadInMinutes, remaining);
  assumedByDay.set(day, spent + granted);
  if (granted === session.assumedLeadInMinutes) return session;
  const first = session.points[0];
  const start = first === undefined ? session.start : first.at - minutesToMs(granted);
  if (session.end - start < minMs) return null;
  return { ...session, start, assumedLeadInMinutes: granted, boundedBy: 'day-cap' };
}

function toSession(
  run: Run,
  clientId: string,
  sorted: readonly PointProof[],
  checkouts: readonly Evidence[],
  settings: ReconstructionSettings,
  minMs: number,
  tailMs: number,
): Session | null {
  const first = run.points[0];
  const last = run.points[run.points.length - 1];
  if (!first || !last) return null;
  const resumed = run.pauseMinutes > 0;
  const resolution = resumed
    ? { start: first.at, assumedLeadInMinutes: 0, startKind: 'resume' as const, boundedBy: 'none' as const }
    : resolveStart(first.at, first.evidence.repo ?? null, previousProofAt(sorted, first.at), checkouts, settings);
  const end = last.at + tailMs;
  if (end - resolution.start < minMs) return null;
  return {
    clientId,
    repo: first.evidence.repo ?? null,
    start: resolution.start,
    end,
    assumedLeadInMinutes: resolution.assumedLeadInMinutes,
    points: run.points,
    startKind: resolution.startKind,
    boundedBy: resolution.boundedBy,
    pauseMinutes: run.pauseMinutes,
  };
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
