import { execFile } from 'node:child_process';

/**
 * Read-only Git access (HEU-F-01, HEU-N-07).
 *
 * Two guards keep the promise that the collector never writes to a repository:
 *
 * 1. `execFile` with an argv array and no shell, so nothing can be injected;
 * 2. an allowlist of subcommands checked *before* the process starts, so a
 *    mistake in a caller fails loudly instead of quietly rewriting history.
 *
 * `GIT_OPTIONAL_LOCKS=0` is the third guard: without it `git status` refreshes
 * the index (a write) just because it noticed a racy timestamp.
 */

export type GitRunner = (args: readonly string[], cwd: string) => Promise<string>;

const MAX_BUFFER = 64 * 1024 * 1024;

/** Subcommands the collector may run: exactly the read-only set the contract lists. */
export const READ_SUBCOMMANDS: readonly string[] = [
  'rev-parse',
  'log',
  'reflog',
  'config',
  'status',
  'for-each-ref',
];

/** Subcommands that write, listed only to produce a helpful error message. */
export const WRITE_SUBCOMMANDS: readonly string[] = [
  'add',
  'am',
  'apply',
  'archive',
  'bisect',
  'branch',
  'checkout',
  'cherry-pick',
  'clean',
  'clone',
  'commit',
  'fetch',
  'filter-branch',
  'gc',
  'init',
  'maintenance',
  'merge',
  'mv',
  'notes',
  'pack-refs',
  'prune',
  'pull',
  'push',
  'rebase',
  'remote',
  'repack',
  'replace',
  'reset',
  'restore',
  'revert',
  'rm',
  'stash',
  'submodule',
  'switch',
  'tag',
  'update-ref',
  'update-index',
  'worktree',
  'write-tree',
];

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;

  constructor(message: string, args: readonly string[], cwd: string, exitCode: number | null) {
    super(message);
    this.name = 'GitCommandError';
    this.args = [...args];
    this.cwd = cwd;
    this.exitCode = exitCode;
  }
}

/** Raised when a caller asks for something that could write to a repository. */
export class GitReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitReadOnlyError';
  }
}

const GLOBAL_VALUE_FLAGS = new Set(['-c', '--git-dir', '--work-tree', '-C']);

function findSubcommand(args: readonly string[]): number {
  let index = 0;
  while (index < args.length) {
    const token = args[index] ?? '';
    if (GLOBAL_VALUE_FLAGS.has(token)) {
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    return index;
  }
  return -1;
}

function assertReadOnlyArguments(subcommand: string, rest: readonly string[]): void {
  for (const arg of rest) {
    if (arg === '--output' || arg.startsWith('--output=') || arg === '--exec' || arg.startsWith('--exec=')) {
      throw new GitReadOnlyError(`refusing git argument "${arg}": it writes a file or runs a program`);
    }
  }
  if (subcommand === 'config') {
    const reads = rest.some(
      (arg) => arg === '--get' || arg === '--get-all' || arg === '--get-regexp' || arg === '--list' || arg === '-l',
    );
    if (!reads) throw new GitReadOnlyError('git config is only allowed with --get, --get-all, --get-regexp or --list');
  }
  if (subcommand === 'status' && !rest.includes('--porcelain')) {
    throw new GitReadOnlyError('git status is only allowed with --porcelain');
  }
  if (subcommand === 'reflog') {
    const verb = rest.find((arg) => !arg.startsWith('-'));
    if (verb === 'expire' || verb === 'delete' || verb === 'drop') {
      throw new GitReadOnlyError(`git reflog ${verb} rewrites the journal`);
    }
  }
}

/** Throws unless the argv can only read. Exported so tests can prove the guard. */
export function assertReadOnlyCommand(args: readonly string[]): void {
  const index = findSubcommand(args);
  if (index === -1) throw new GitReadOnlyError(`no git subcommand in: git ${args.join(' ')}`);
  const subcommand = args[index] ?? '';
  if (WRITE_SUBCOMMANDS.includes(subcommand)) {
    throw new GitReadOnlyError(
      `refusing to run "git ${subcommand}": the collector never writes to a repository (HEU-F-01)`,
    );
  }
  if (!READ_SUBCOMMANDS.includes(subcommand)) {
    throw new GitReadOnlyError(`unsupported git subcommand "${subcommand}": the collector only reads`);
  }
  assertReadOnlyArguments(subcommand, args.slice(index + 1));
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Without this, `git status` may rewrite the index just to clear racy timestamps.
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
    LANGUAGE: 'C',
  };
}

function firstLine(value: string): string {
  const trimmed = value.trim();
  const newline = trimmed.indexOf('\n');
  return newline === -1 ? trimmed : trimmed.slice(0, newline);
}

function execGit(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      [...args],
      { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, env: gitEnv(), windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          const exitCode = typeof error.code === 'number' ? error.code : null;
          const detail = firstLine(stderr) || error.message;
          rejectPromise(new GitCommandError(`git ${args.join(' ')} failed in ${cwd}: ${detail}`, args, cwd, exitCode));
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}

/** The real runner: argv only, no shell, allowlisted subcommands. */
export function createGitRunner(): GitRunner {
  return async (args, cwd) => {
    assertReadOnlyCommand(args);
    return execGit(args, cwd);
  };
}

/** `git@example.com:acme/api.git` → `example.com/acme/api`, the shape D.10 shows. */
export function normalizeRemoteUrl(url: string): string {
  let value = url.trim();
  if (!value.includes('://')) {
    const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
    if (scp !== null) value = `${scp[1] ?? ''}/${scp[2] ?? ''}`;
  }
  value = value.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '').replace(/\.git$/i, '');
  return value.replace(/\/+$/, '');
}

export async function readRemoteUrl(run: GitRunner, repoPath: string): Promise<string | null> {
  try {
    const url = (await run(['config', '--get', 'remote.origin.url'], repoPath)).trim();
    return url.length === 0 ? null : normalizeRemoteUrl(url);
  } catch {
    return null;
  }
}
