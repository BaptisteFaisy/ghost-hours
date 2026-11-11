import type { Instant } from '@ghost-hours/core';
import { FIELD_SEP, RECORD_SEP, splitFields } from './commits.ts';
import type { GitRunner } from './git.ts';

/**
 * Reference journal evidence (D.4).
 *
 * The reflog is the only source that says when a session *started*: a commit
 * proves work was finished, a `checkout: moving from … to …` line proves the
 * developer switched branch at that instant. The journal only exists on the
 * machine where the work happened and expires after a few months, hence the
 * advice to collect regularly.
 */

export interface CheckoutRecord {
  readonly at: Instant;
  readonly from: string | null;
  readonly to: string;
}

const CHECKOUT_PREFIX = 'checkout: moving from ';
const BRANCH_PREFIX = 'branch: Created from ';

export function buildReflogArgs(): readonly string[] {
  return [
    'reflog',
    'show',
    '--all',
    '--date=iso-strict',
    `--pretty=format:${RECORD_SEP}%gD${FIELD_SEP}%gd${FIELD_SEP}%gs`,
  ];
}

/** `refs/heads/feat/export@{2026-11-03T14:05:52+01:00}` → `feat/export`. */
function refName(selector: string): string | null {
  const brace = selector.indexOf('@{');
  const ref = brace === -1 ? selector : selector.slice(0, brace);
  if (ref.length === 0 || ref === 'HEAD') return null;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref.replace(/^refs\//, '');
}

/** The reflog selector carries the entry date with its original offset. */
export function parseSelectorDate(selector: string): Instant | null {
  const match = /@\{([^}]+)\}$/.exec(selector);
  if (match === null) return null;
  const parsed = Date.parse(match[1] ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

interface ParsedEntry {
  readonly record: CheckoutRecord;
  /** `branch: Created from …` is a weaker signal than an explicit `checkout:`. */
  readonly branchCreation: boolean;
}

function parseMessage(
  message: string,
  selector: string,
): { from: string | null; to: string; branchCreation: boolean } | null {
  if (message.startsWith(CHECKOUT_PREFIX)) {
    const rest = message.slice(CHECKOUT_PREFIX.length);
    const split = rest.lastIndexOf(' to ');
    if (split === -1) return null;
    return { from: rest.slice(0, split).trim(), to: rest.slice(split + 4).trim(), branchCreation: false };
  }
  if (message.startsWith(BRANCH_PREFIX)) {
    const target = refName(selector);
    if (target === null) return null;
    const from = message.slice(BRANCH_PREFIX.length).trim();
    return { from: from === 'HEAD' ? null : from, to: target, branchCreation: true };
  }
  return null;
}

function parseEntry(chunk: string): ParsedEntry | null {
  const text = chunk.trim();
  if (text.length === 0) return null;
  const [selector, shortSelector, message] = splitFields(text, 3);
  if (selector === undefined || message === undefined) return null;
  const at = parseSelectorDate(shortSelector ?? selector);
  if (at === null) return null;
  const parsed = parseMessage(message, selector);
  if (parsed === null) return null;
  return {
    record: { at, from: parsed.from, to: parsed.to },
    branchCreation: parsed.branchCreation,
  };
}

/**
 * Reads the journal and keeps branch switches only.
 *
 * `--all` walks every reference journal, so one switch is usually reported
 * twice: `HEAD` says `checkout: moving from main to feat/export`, the branch
 * itself says `branch: Created from HEAD`. Entries are deduplicated on
 * `(instant, target)`; explicit checkouts are visited first so the richer
 * message wins, which keeps the output stable and free of `from: HEAD` noise.
 */
export function parseReflog(output: string): readonly CheckoutRecord[] {
  const parsed: ParsedEntry[] = [];
  for (const chunk of output.split(RECORD_SEP)) {
    const entry = parseEntry(chunk);
    if (entry !== null) parsed.push(entry);
  }
  const ordered = [...parsed.filter((entry) => !entry.branchCreation), ...parsed.filter((e) => e.branchCreation)];
  const records: CheckoutRecord[] = [];
  const seen = new Set<string>();
  for (const entry of ordered) {
    const key = `${entry.record.at}|${entry.record.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(entry.record);
  }
  return records;
}

export async function readCheckouts(
  run: GitRunner,
  repoPath: string,
): Promise<readonly CheckoutRecord[]> {
  const output = await run(buildReflogArgs(), repoPath);
  return parseReflog(output);
}
