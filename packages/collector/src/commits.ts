import type { Instant } from '@ghost-hours/core';
import type { GitRunner } from './git.ts';

/**
 * Commit evidence (D.4, HEU-F-01).
 *
 * The author date is preferred over the commit date: a rebase rewrites the
 * latter but not the moment the work was finished. Every reference is read
 * (`--all`), so a commit made on a branch that was never merged still counts.
 */

export const RECORD_SEP = '\u001e';
export const FIELD_SEP = '\u001f';

export interface CommitRecord {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorAt: Instant;
  /** `null` with `--no-summaries`: the subject is never read (HEU-N-07). */
  readonly summary: string | null;
  readonly branch: string | null;
  readonly added: number;
  readonly deleted: number;
  /** Git's own signature letter (`%G?`): `G`, `B`, `U`, `X`, `Y`, `R`, `E`, `N`. */
  readonly signature: string;
  /** Signer name (`%GS`) and key fingerprint (`%GK`); `null` when Git reports none. */
  readonly signer: string | null;
  readonly keyFingerprint: string | null;
  /** The committer (`%ce`), not the author: a rebase keeps the author and moves the committer. */
  readonly committerEmail: string;
  /** The commit instant (`%cI`); `null` when Git does not report it. */
  readonly committedAt: Instant | null;
}

export interface CommitFilter {
  readonly authors: readonly string[];
  readonly since: Instant | null;
  readonly until: Instant | null;
  readonly summaries: boolean;
}

function authorArguments(authors: readonly string[]): string[] {
  if (authors.length === 0) return [];
  const args = ['--fixed-strings', '--regexp-ignore-case'];
  for (const author of authors) args.push(`--author=${author}`);
  return args;
}

/**
 * The argv used to read commits; exported so the read-only guard can be tested on it.
 *
 * The five signature fields (`%G?`, `%GS`, `%GK`, `%ce`, `%cI`) come after the
 * identity ones. The subject stays the last field: it is free text, and a
 * subject containing the field separator must not shift the values before it.
 */
export function buildLogArgs(filter: CommitFilter): readonly string[] {
  const fields = ['%H', '%an', '%ae', '%aI', '%S', '%G?', '%GS', '%GK', '%ce', '%cI'];
  if (filter.summaries) fields.push('%s');
  return [
    'log',
    '--all',
    '--source',
    '--date-order',
    '--no-color',
    '--no-show-signature',
    `--pretty=format:${RECORD_SEP}${fields.join('%x1f')}`,
    '--numstat',
    ...authorArguments(filter.authors),
  ];
}

/** Splits on the first `count - 1` separators; the last field keeps its separators. */
export function splitFields(value: string, count: number): string[] {
  const out: string[] = [];
  let rest = value;
  for (let index = 0; index < count - 1; index += 1) {
    const separator = rest.indexOf(FIELD_SEP);
    if (separator === -1) {
      out.push(rest);
      rest = '';
      continue;
    }
    out.push(rest.slice(0, separator));
    rest = rest.slice(separator + 1);
  }
  out.push(rest);
  return out;
}

function toCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sumNumstat(body: string): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of body.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    added += toCount(parts[0]);
    deleted += toCount(parts[1]);
  }
  return { added, deleted };
}

export function branchFromRef(ref: string | undefined): string | null {
  if (ref === undefined || ref.length === 0) return null;
  for (const prefix of ['refs/heads/', 'refs/remotes/']) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return null;
}

/** The fields read for every commit, in the order `buildLogArgs` writes them. */
const FIELD_COUNT = 10;

/** The subject is read only with summaries; it always comes last. */
const SUMMARY_INDEX = FIELD_COUNT;

/** Git writes `N` for an unsigned commit; some versions leave the field empty. */
function signatureLetter(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  return value.length === 0 ? 'N' : value;
}

/** An empty value means "Git reported nothing": the field is then absent, not empty. */
function optionalText(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  return value.length === 0 ? null : value;
}

/** An instant that cannot be read is absent, never guessed. */
function parseInstant(raw: string | undefined): Instant | null {
  const parsed = Date.parse((raw ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChunk(chunk: string, summaries: boolean): CommitRecord | null {
  const text = chunk.trim();
  if (text.length === 0) return null;
  const newline = text.indexOf('\n');
  const header = newline === -1 ? text : text.slice(0, newline);
  const body = newline === -1 ? '' : text.slice(newline + 1);
  const fields = splitFields(header, summaries ? FIELD_COUNT + 1 : FIELD_COUNT);
  const [sha, authorName, authorEmail, authorDate, source, signature, signer, key, committer, committed] = fields;
  if (sha === undefined || !/^[0-9a-f]{7,64}$/.test(sha)) return null;
  const authorAt = Date.parse(authorDate ?? '');
  if (!Number.isFinite(authorAt)) return null;
  const stats = sumNumstat(body);
  return {
    sha,
    authorName: authorName ?? '',
    authorEmail: authorEmail ?? '',
    authorAt,
    summary: summaries ? (fields[SUMMARY_INDEX] ?? '') : null,
    branch: branchFromRef(source),
    added: stats.added,
    deleted: stats.deleted,
    signature: signatureLetter(signature),
    signer: optionalText(signer),
    keyFingerprint: optionalText(key),
    committerEmail: committer ?? '',
    committedAt: parseInstant(committed),
  };
}

export function parseLogOutput(output: string, summaries: boolean): readonly CommitRecord[] {
  const records: CommitRecord[] = [];
  for (const chunk of output.split(RECORD_SEP)) {
    const record = parseChunk(chunk, summaries);
    if (record !== null) records.push(record);
  }
  return records;
}

/**
 * `--author` already filters inside Git, but the filter is applied again here:
 * it keeps the behaviour explicit and lets a needle match either the name or
 * the address (the specification says "email or name").
 */
export function filterCommits(
  records: readonly CommitRecord[],
  filter: CommitFilter,
): readonly CommitRecord[] {
  const needles = filter.authors.map((author) => author.trim().toLowerCase()).filter((a) => a.length > 0);
  return records.filter((record) => {
    if (filter.since !== null && record.authorAt < filter.since) return false;
    if (filter.until !== null && record.authorAt >= filter.until) return false;
    if (needles.length === 0) return true;
    const haystack = `${record.authorName} <${record.authorEmail}>`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

export async function readCommits(
  run: GitRunner,
  repoPath: string,
  filter: CommitFilter,
): Promise<readonly CommitRecord[]> {
  const output = await run(buildLogArgs(filter), repoPath);
  return filterCommits(parseLogOutput(output, filter.summaries), filter);
}
