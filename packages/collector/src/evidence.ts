import type { Evidence, EvidenceFileMeta, EvidenceFileOut } from '@ghost-hours/core';
import { checkoutEvidenceId, commitEvidenceId, serializeEvidenceFile } from '@ghost-hours/core';
import { dirname } from 'node:path';
import type { CommitRecord } from './commits.ts';
import type { FsPort } from './fs-port.ts';
import type { CheckoutRecord } from './reflog.ts';

/**
 * Evidence assembly (format D.10).
 *
 * Ids come from `@ghost-hours/core` and are hashes of the data, so importing
 * the same history twice yields the same ids and no duplicate (HEU-F-06,
 * HEU-P-14). Ordering is fully explicit: by instant, then by id.
 */

export interface CommitEvidenceInput {
  readonly repo: string;
  readonly remote: string | null;
  readonly commit: CommitRecord;
  readonly summaries: boolean;
}

export interface CheckoutEvidenceInput {
  readonly repo: string;
  readonly remote: string | null;
  readonly record: CheckoutRecord;
}

function byString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function commitToEvidence(input: CommitEvidenceInput): Evidence {
  const { repo, remote, commit, summaries } = input;
  return {
    id: commitEvidenceId(repo, commit.sha),
    source: 'git',
    kind: 'commit',
    // The collector never assigns a client: that is the mapping package's job (HEU-F-08).
    clientId: null,
    at: commit.authorAt,
    repo,
    added: commit.added,
    deleted: commit.deleted,
    authorEmail: commit.authorEmail,
    ...(remote === null ? {} : { remote }),
    ...(commit.branch === null ? {} : { branch: commit.branch }),
    ...(summaries && commit.summary !== null ? { summary: commit.summary } : {}),
  };
}

export function checkoutToEvidence(input: CheckoutEvidenceInput): Evidence {
  const { repo, remote, record } = input;
  return {
    id: checkoutEvidenceId(repo, record.at, record.to),
    source: 'git',
    kind: 'checkout',
    clientId: null,
    at: record.at,
    repo,
    to: record.to,
    ...(remote === null ? {} : { remote }),
    ...(record.from === null ? {} : { from: record.from }),
  };
}

function instantOf(item: Evidence): number {
  return item.at ?? item.start ?? 0;
}

/** Deduplicates by id, then sorts by instant and id (HEU-F-16, HEU-P-03). */
export function buildEvidenceItems(items: readonly Evidence[]): Evidence[] {
  const sorted = [...items].sort((left, right) => {
    const delta = instantOf(left) - instantOf(right);
    return delta !== 0 ? delta : byString(left.id, right.id);
  });
  const seen = new Set<string>();
  const unique: Evidence[] = [];
  for (const item of sorted) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export function toEvidenceFile(items: readonly Evidence[], meta: EvidenceFileMeta): EvidenceFileOut {
  return serializeEvidenceFile(items, meta);
}

/** Stable JSON: two identical collections produce identical bytes (HEU-P-14). */
export function evidenceText(wire: EvidenceFileOut): string {
  return `${JSON.stringify(wire, null, 2)}\n`;
}

/** Writes through a sibling `.tmp` file then renames, so a crash never truncates the target. */
export async function writeEvidenceFile(
  fs: FsPort,
  outPath: string,
  wire: EvidenceFileOut,
): Promise<void> {
  const temporary = `${outPath}.tmp`;
  await fs.mkdir(dirname(outPath));
  await fs.writeFile(temporary, evidenceText(wire));
  await fs.rename(temporary, outPath);
}
