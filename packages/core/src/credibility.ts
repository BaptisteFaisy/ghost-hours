import type { Block, Evidence, Instant } from './types.ts';

/**
 * The fraud signals of one piece of evidence — the part of the tracking system
 * that cannot be delegated to a number.
 *
 * Honesty first: nothing here can make a proof impossible to fake. Git author
 * and committer dates are self-attested, so a past instant can always be
 * written today. What these signals do is the other half of the equation: they
 * say, for each proof, *what kind of trust it rests on*, so a reviewer can see
 * the difference between a signed, third-party-verifiable commit and a
 * backdated unsigned one. Detection, not prevention — and detection is the
 * whole product.
 */

export type CredibilitySignal =
  /** A commit with no cryptographic signature: nothing links it to a key. */
  | 'unsigned'
  /** `%G?` is `B` or `U`: a signature that does not verify. */
  | 'signature-invalid'
  /** `%G?` is `X`, `Y`, `R` or `E`: unknown, expired or revoked key. */
  | 'signature-unverified'
  /** The committer is not the author: the history has been touched by someone else (or a tool). */
  | 'committer-differs'
  /** The commit instant predates the author instant: clocks were moved. */
  | 'committed-before-authored';

/** A lookup letter for the signature status, shared by the UI and the tests. */
export type SignatureLetter = 'G' | 'B' | 'U' | 'X' | 'Y' | 'R' | 'E' | 'N';

const INVALID: ReadonlySet<string> = new Set(['B', 'U']);
const UNVERIFIED: ReadonlySet<string> = new Set(['X', 'Y', 'R', 'E']);

function signatureOf(evidence: Evidence): string {
  return evidence.signature ?? '';
}

/** Commits without a signature: any history anyone can write. */
export function isUnsigned(evidence: Evidence): boolean {
  if (evidence.kind !== 'commit') return false;
  const letter = signatureOf(evidence);
  return letter === '' || letter === 'N';
}

/**
 * The signals of one proof, in a stable order. A clean signed commit yields an
 * empty list; a backdated unsigned one yields several.
 */
export function credibilitySignals(evidence: Evidence): readonly CredibilitySignal[] {
  if (evidence.kind !== 'commit') return [];
  const signals: CredibilitySignal[] = [];
  const letter = signatureOf(evidence);
  if (letter === '' || letter === 'N') signals.push('unsigned');
  else if (INVALID.has(letter)) signals.push('signature-invalid');
  else if (UNVERIFIED.has(letter)) signals.push('signature-unverified');

  const author = (evidence.authorEmail ?? '').toLowerCase();
  const committer = (evidence.committerEmail ?? '').toLowerCase();
  if (committer !== '' && committer !== author) signals.push('committer-differs');

  const at = evidence.at;
  const committedAt = evidence.committedAt;
  if (at !== undefined && committedAt !== undefined && committedAt < at) {
    signals.push('committed-before-authored');
  }
  return signals;
}

/** A proof is *clean* when it is signed and the clocks agree; a `checkout` is clean too. */
export function isClean(evidence: Evidence): boolean {
  return credibilitySignals(evidence).length === 0;
}

/**
 * The signed share of a list of proofs, in [0, 1]: commits carrying a `G`
 * (trusted, valid) signature over the commits read. A month whose commits are
 * all signed by the author's key reads 1; one full of unsigned commits reads 0.
 */
export function signedShare(items: readonly Evidence[]): number {
  const commits = items.filter((item) => item.kind === 'commit');
  if (commits.length === 0) return 1;
  const signed = commits.filter((item) => signatureOf(item) === 'G');
  return signed.length / commits.length;
}

/**
 * Above this, the assumed start outweighs the proof: the block is mostly the
 * courtesy the tool grants before a commit, barely the work itself.
 */
export const ASSUMED_DOMINANCE = 0.5;

/**
 * The share of a block that rests on the assumed lead-in rather than on proof.
 *
 * A month farmed with commits inflates the *assumed* minutes — never the
 * proven ones — and a block whose assumed start outweighs its proof is the
 * visible trace of it. The product does not cap those minutes: a cap would
 * break the monotonicity guarantee (HEU-P-04, adding a proof never lowers the
 * reconstructed time), which is a stronger promise than the cap would be.
 */
export function assumedShareOfBlock(block: Block): number {
  const total = Math.max(0, (block.end - block.start) / 60_000);
  if (total === 0) return 0;
  return block.assumedLeadInMinutes / total;
}

/** True when the block is mostly assumed time: a block worth a second look. */
export function isAssumptionDominant(block: Block): boolean {
  return assumedShareOfBlock(block) > ASSUMED_DOMINANCE;
}

/** The instant a commit was committed, or its author instant when unknown. */
export function committedInstant(evidence: Evidence): Instant | undefined {
  return evidence.committedAt ?? evidence.at;
}