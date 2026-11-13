import type { Evidence, EvidenceFileMeta, EvidenceFileOut, Instant } from '@ghost-hours/core';
import { addDaysInZone, parseDayKey, zonedTimeToInstant } from '@ghost-hours/core';
import { basename, resolve } from 'node:path';
import type { CommitRecord } from './commits.ts';
import { readCommits } from './commits.ts';
import { discoverRepos } from './discover.ts';
import type { DiscoveredRepo } from './discover.ts';
import {
  buildEvidenceItems,
  checkoutToEvidence,
  commitToEvidence,
  evidenceText,
  toEvidenceFile,
  writeEvidenceFile,
} from './evidence.ts';
import type { FsPort } from './fs-port.ts';
import { createNodeFs } from './fs-port.ts';
import type { GitRunner } from './git.ts';
import { createGitRunner, readRemoteUrl } from './git.ts';
import type { CheckoutRecord } from './reflog.ts';
import { readCheckouts } from './reflog.ts';
import type { CollectOptions } from './options.ts';
import { assertRepoUnchanged, fingerprintRepo, ReadOnlyViolation } from './readonly-guard.ts';
import { VERSION } from './version.ts';

export interface CollectDeps {
  readonly git?: GitRunner;
  readonly fs?: FsPort;
  readonly now?: () => number;
}

export interface RepoReport {
  readonly path: string;
  readonly name: string;
  readonly remote: string | null;
  readonly commitCount: number;
  readonly checkoutCount: number;
  /** `null` when the repository was read without trouble. */
  readonly error: string | null;
}

export interface CollectReport {
  readonly timeZone: string;
  readonly repos: readonly RepoReport[];
  readonly itemCount: number;
  readonly commitCount: number;
  readonly checkoutCount: number;
  /** Absolute path of the written file; `null` when nothing was written. */
  readonly out: string | null;
  readonly wrote: boolean;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
  /** The serialised evidence file, always available for `--json`. */
  readonly fileText: string;
}

interface Window {
  readonly since: Instant | null;
  readonly until: Instant | null;
}

interface RepoContext {
  readonly run: GitRunner;
  readonly repo: DiscoveredRepo;
  readonly options: CollectOptions;
  readonly window: Window;
}

interface RepoOutcome {
  readonly report: RepoReport;
  readonly evidence: readonly Evidence[];
  readonly warnings: readonly string[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startOfDay(dayKey: string, timeZone: string): Instant {
  const { year, month, day } = parseDayKey(dayKey);
  return zonedTimeToInstant({ year, month, day }, timeZone);
}

/** `--since`/`--until` name local days, so both bounds are resolved in the target zone. */
function resolveWindow(options: CollectOptions): Window {
  const since = options.sinceDayKey === null ? null : startOfDay(options.sinceDayKey, options.timeZone);
  const until =
    options.untilDayKey === null ? null : addDaysInZone(startOfDay(options.untilDayKey, options.timeZone), 1, options.timeZone);
  return { since, until };
}

function inWindow(at: Instant, window: Window): boolean {
  if (window.since !== null && at < window.since) return false;
  if (window.until !== null && at >= window.until) return false;
  return true;
}

function filterCheckouts(records: readonly CheckoutRecord[], window: Window): CheckoutRecord[] {
  return records.filter((record) => inWindow(record.at, window));
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dedupeRepos(repos: readonly DiscoveredRepo[]): DiscoveredRepo[] {
  const seen = new Map<string, DiscoveredRepo>();
  for (const repo of repos) if (!seen.has(repo.path)) seen.set(repo.path, repo);
  return [...seen.values()].sort((left, right) => comparePaths(left.path, right.path));
}

async function resolveRepos(
  fs: FsPort,
  options: CollectOptions,
  warnings: string[],
): Promise<DiscoveredRepo[]> {
  if (options.repos.length > 0) {
    return dedupeRepos(options.repos.map((path) => {
      const absolute = resolve(path);
      return { path: absolute, name: basename(absolute) };
    }));
  }
  const discovered = await discoverRepos(fs, {
    roots: options.dirs,
    maxDepth: options.maxDepth,
    excludes: options.excludes,
  });
  warnings.push(...discovered.warnings);
  if (discovered.repos.length === 0) {
    warnings.push(`no Git repository found under: ${options.dirs.join(', ')}`);
  }
  return [...discovered.repos];
}

function emptyReport(repo: DiscoveredRepo, error: string): RepoReport {
  return { path: repo.path, name: repo.name, remote: null, commitCount: 0, checkoutCount: 0, error };
}

function commitEvidenceFor(
  repo: DiscoveredRepo,
  remote: string | null,
  commits: readonly CommitRecord[],
  summaries: boolean,
): Evidence[] {
  return commits.map((commit) => commitToEvidence({ repo: repo.name, remote, commit, summaries }));
}

function checkoutEvidenceFor(
  repo: DiscoveredRepo,
  remote: string | null,
  checkouts: readonly CheckoutRecord[],
): Evidence[] {
  return checkouts.map((record) => checkoutToEvidence({ repo: repo.name, remote, record }));
}

/** Reads one repository; any failure becomes an explicit report entry, never a throw. */
async function collectRepo(context: RepoContext): Promise<RepoOutcome> {
  const { run, repo, options, window } = context;
  try {
    const before = await fingerprintRepo(run, repo.path);
    const remote = await readRemoteUrl(run, repo.path);
    const commits = await readCommits(run, repo.path, {
      authors: options.authors,
      since: window.since,
      until: window.until,
      summaries: options.summaries,
    });
    const checkouts = filterCheckouts(await readCheckouts(run, repo.path), window);
    assertRepoUnchanged(repo.path, before, await fingerprintRepo(run, repo.path));
    return {
      report: {
        path: repo.path,
        name: repo.name,
        remote,
        commitCount: commits.length,
        checkoutCount: checkouts.length,
        error: null,
      },
      evidence: [
        ...commitEvidenceFor(repo, remote, commits, options.summaries),
        ...checkoutEvidenceFor(repo, remote, checkouts),
      ],
      warnings: [],
    };
  } catch (error) {
    if (error instanceof ReadOnlyViolation) throw error;
    return {
      report: emptyReport(repo, describe(error)),
      evidence: [],
      warnings: [`${repo.path}: ${describe(error)}`],
    };
  }
}

function buildMeta(report: readonly RepoReport[], options: CollectOptions, collectedAt: number): EvidenceFileMeta {
  return {
    collectedAt,
    generator: `ghost-hours-collector@${VERSION}`,
    timeZone: options.timeZone,
    repos: report.map((repo) => ({
      path: repo.path,
      name: repo.name,
      ...(repo.remote === null ? {} : { remote: repo.remote }),
      commitCount: repo.commitCount,
      reflogEntries: repo.checkoutCount,
    })),
  };
}

/**
 * Writes the file only when the run is trustworthy: a partially read history
 * would look complete to the app, so a failed repository means "fix it and run
 * again" rather than a half-empty evidence file.
 */
async function emit(
  fs: FsPort,
  options: CollectOptions,
  wire: EvidenceFileOut,
  clean: boolean,
): Promise<string | null> {
  if (options.dryRun || options.json || !clean) return null;
  const target = resolve(options.out);
  await writeEvidenceFile(fs, target, wire);
  return target;
}

/**
 * Collects Git evidence from the given options.
 *
 * Pure enough to be tested: `deps` injects the Git runner, the filesystem and
 * the clock, so a test can pin `collected_at` and compare two runs byte for
 * byte (HEU-P-14). Nothing is written to a repository, and every repository is
 * fingerprinted before and after being read (HEU-F-01).
 */
export async function collect(options: CollectOptions, deps: CollectDeps = {}): Promise<CollectReport> {
  const run = deps.git ?? createGitRunner();
  const fs = deps.fs ?? createNodeFs();
  const now = deps.now ?? Date.now;
  const warnings: string[] = [];
  const window = resolveWindow(options);
  const repos = await resolveRepos(fs, options, warnings);
  const reports: RepoReport[] = [];
  const collected: Evidence[] = [];
  for (const repo of repos) {
    const outcome = await collectRepo({ run, repo, options, window });
    reports.push(outcome.report);
    collected.push(...outcome.evidence);
    warnings.push(...outcome.warnings);
  }
  const items = buildEvidenceItems(collected);
  const wire = toEvidenceFile(items, buildMeta(reports, options, now()));
  const clean = reports.every((report) => report.error === null);
  const out = await emit(fs, options, wire, clean);
  return {
    timeZone: options.timeZone,
    repos: reports,
    itemCount: items.length,
    commitCount: items.filter((item) => item.kind === 'commit').length,
    checkoutCount: items.filter((item) => item.kind === 'checkout').length,
    out,
    wrote: out !== null,
    dryRun: options.dryRun,
    warnings,
    fileText: evidenceText(wire),
  };
}

export type { CollectOptions } from './options.ts';
export { CLI_NAME, DEFAULT_MAX_DEPTH, DEFAULT_OUT, HELP_TEXT, parseArgv } from './options.ts';
export { ALWAYS_SKIPPED, discoverRepos, globToRegExp, matchesGlob } from './discover.ts';
export type { DiscoverOptions, DiscoveredRepo, DiscoverResult } from './discover.ts';
export type { GitRunner } from './git.ts';
export { assertReadOnlyCommand, createGitRunner, GitCommandError, GitReadOnlyError, normalizeRemoteUrl } from './git.ts';
export type { CommitRecord } from './commits.ts';
export { branchFromRef, buildLogArgs, parseLogOutput, readCommits } from './commits.ts';
export type { CheckoutRecord } from './reflog.ts';
export { buildReflogArgs, parseReflog, readCheckouts } from './reflog.ts';
export { buildEvidenceItems, checkoutToEvidence, commitToEvidence, evidenceText, writeEvidenceFile } from './evidence.ts';
export type { FsPort } from './fs-port.ts';
export { createNodeFs } from './fs-port.ts';
export type { RepoFingerprint } from './readonly-guard.ts';
export { assertRepoUnchanged, fingerprintRepo, isClean, ReadOnlyViolation } from './readonly-guard.ts';
export { VERSION } from './version.ts';
