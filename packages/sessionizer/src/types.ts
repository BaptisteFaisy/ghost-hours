import type { BlockReason, Evidence, Instant, Minutes } from '@ghost-hours/core';

/**
 * Internal vocabulary of the reconstruction (spec D.5).
 *
 * The public shapes live in `@ghost-hours/core`; everything here is the
 * plumbing between the nine steps of D.5 and never leaves the package.
 */

/** A piece of evidence that marks an instant (commit, note). */
export interface PointProof {
  readonly evidence: Evidence;
  readonly at: Instant;
}

/** A run of point proofs of one client, from `start` to `end`. */
export interface Session {
  readonly clientId: string;
  /** Repository of the first proof, used to look for a checkout marker. */
  readonly repo: string | null;
  readonly start: Instant;
  readonly end: Instant;
  readonly assumedLeadInMinutes: Minutes;
  readonly points: readonly PointProof[];
  /** How the start was decided, so the block can explain itself. */
  readonly startKind: 'checkout' | 'assumed' | 'resume';
  /** What bounds an assumed lead-in, when there is one. */
  /** `day-cap`: the day already spent its assumed start, so this one assumes nothing. */
  readonly boundedBy: 'previous-proof' | 'workday-start' | 'none' | 'day-cap';
  /** Length of the pause before this session, when it follows a break. */
  readonly pauseMinutes: Minutes;
}

/** A block before confidence and statuses are settled. */
export interface BlockDraft {
  readonly start: Instant;
  readonly end: Instant;
  readonly clientId: string;
  readonly origin: 'git-session' | 'meeting' | 'merged' | 'manual';
  readonly evidenceIds: readonly string[];
  readonly assumedLeadInMinutes: Minutes;
  readonly reason?: BlockReason;
  /** Set when a contradiction touched this draft (HEU-F-14). */
  readonly conflicted?: boolean;
  /** Draft keys that were merged into this one, for conflict bookkeeping. */
  readonly constituents?: readonly string[];
}

export interface Contradiction {
  readonly start: Instant;
  readonly end: Instant;
  readonly blockIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly reason: string;
}
