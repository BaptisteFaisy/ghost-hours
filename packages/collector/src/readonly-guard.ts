import { GitCommandError } from './git.ts';
import type { GitRunner } from './git.ts';

/**
 * The read-only guarantee (HEU-F-01, acceptance D.17).
 *
 * Before and after reading a repository the collector takes a fingerprint of
 * what a write would change: the checked-out commit, the branch and the working
 * tree status. If any of them moved, the collection fails loudly instead of
 * handing back evidence produced by a mutating run. The same helper is what the
 * tests use to prove the recipe "the state of each repository is identical
 * before and after".
 */

export interface RepoFingerprint {
  /** `null` when the repository has no commit yet. */
  readonly head: string | null;
  readonly branch: string | null;
  /** `git status --porcelain`: empty for a clean tree. */
  readonly status: string | null;
}

export class ReadOnlyViolation extends Error {
  readonly repoPath: string;
  readonly changed: readonly string[];

  constructor(repoPath: string, changed: readonly string[]) {
    super(
      `the collector changed the state of ${repoPath} (${changed.join(', ')}): ` +
        'it must never write to a repository (HEU-F-01)',
    );
    this.name = 'ReadOnlyViolation';
    this.repoPath = repoPath;
    this.changed = [...changed];
  }
}

async function optional(run: GitRunner, args: readonly string[], cwd: string): Promise<string | null> {
  try {
    return (await run(args, cwd)).trim();
  } catch (error) {
    if (error instanceof GitCommandError) return null;
    throw error;
  }
}

export async function fingerprintRepo(run: GitRunner, repoPath: string): Promise<RepoFingerprint> {
  return {
    head: await optional(run, ['rev-parse', 'HEAD'], repoPath),
    branch: await optional(run, ['rev-parse', '--abbrev-ref', 'HEAD'], repoPath),
    status: await optional(run, ['status', '--porcelain'], repoPath),
  };
}

export function assertRepoUnchanged(
  repoPath: string,
  before: RepoFingerprint,
  after: RepoFingerprint,
): void {
  const changed = (['head', 'branch', 'status'] as const).filter((key) => before[key] !== after[key]);
  if (changed.length > 0) throw new ReadOnlyViolation(repoPath, changed);
}

/** True when the repository is clean and on a stable commit. */
export function isClean(fingerprint: RepoFingerprint): boolean {
  return fingerprint.status === '' && fingerprint.head !== null;
}
