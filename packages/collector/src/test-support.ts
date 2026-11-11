import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FsPort } from './fs-port.ts';
import { createNodeFs } from './fs-port.ts';
import type { CollectOptions } from './options.ts';
import { parseArgv } from './options.ts';

/**
 * Real Git fixtures for the collector tests.
 *
 * Every test builds actual repositories in a temporary folder, with pinned
 * author and committer dates, so the evidence produced is exactly what a user
 * would get. `HOME` is redirected into the temporary folder and the system
 * config is disabled, so a developer's `~/.gitconfig` cannot change a result.
 */

export interface Workspace {
  readonly root: string;
  dispose(): Promise<void>;
}

export interface CommitSpec {
  readonly message: string;
  /** ISO instant with offset, used for both author and committer dates. */
  readonly at: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly createBranch?: string;
  readonly checkout?: string;
  readonly author?: { readonly name: string; readonly email: string };
}

export interface RepoSpec {
  readonly name: string;
  readonly commits: readonly CommitSpec[];
}

const SOFIA = { name: 'Sofia Marquez', email: 'sofia@example.com' } as const;
const MALIK = { name: 'Malik Osei', email: 'malik@example.org' } as const;

export async function createWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), 'ghost-hours-collector-'));
  return {
    root,
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function runGit(
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      [...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, ...env },
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          rejectPromise(new Error(`git ${args.join(' ')} failed in ${cwd}: ${stderr || error.message}`));
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}

function baseEnv(workspace: Workspace): Record<string, string> {
  return {
    HOME: workspace.root,
    XDG_CONFIG_HOME: join(workspace.root, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

async function applyCommit(workspace: Workspace, repoPath: string, commit: CommitSpec): Promise<void> {
  const env = { ...baseEnv(workspace), GIT_AUTHOR_DATE: commit.at, GIT_COMMITTER_DATE: commit.at };
  if (commit.createBranch !== undefined) {
    await runGit(['checkout', '--quiet', '-b', commit.createBranch], repoPath, env);
  }
  if (commit.checkout !== undefined) {
    await runGit(['checkout', '--quiet', commit.checkout], repoPath, env);
  }
  for (const [file, content] of Object.entries(commit.files ?? {})) {
    const target = join(repoPath, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  await runGit(['add', '--all'], repoPath, env);
  const author = commit.author ?? SOFIA;
  await runGit(
    ['commit', '--quiet', '-m', commit.message, '--author', `${author.name} <${author.email}>`],
    repoPath,
    env,
  );
}

export async function createRepo(workspace: Workspace, spec: RepoSpec): Promise<string> {
  const repoPath = join(workspace.root, spec.name);
  await mkdir(repoPath, { recursive: true });
  const env = baseEnv(workspace);
  await runGit(['-c', 'init.defaultBranch=main', 'init', '--quiet'], repoPath, env);
  await runGit(['config', 'user.name', SOFIA.name], repoPath, env);
  await runGit(['config', 'user.email', SOFIA.email], repoPath, env);
  await runGit(['config', 'commit.gpgsign', 'false'], repoPath, env);
  for (const commit of spec.commits) await applyCommit(workspace, repoPath, commit);
  return repoPath;
}

/** A month of work by Sofia on `acme-api`, with one branch and one late evening. */
export const ACME_SPEC: RepoSpec = {
  name: 'acme-api',
  commits: [
    {
      message: 'Add CSV export',
      at: '2026-11-03T09:00:00+01:00',
      files: { 'src/export.ts': 'a\nb\nc\n' },
    },
    {
      message: 'Wire export endpoint',
      at: '2026-11-04T10:00:00+01:00',
      createBranch: 'feat/export',
      files: { 'src/export.ts': 'a\nb\nc\nd\ne\n' },
    },
    {
      message: 'Fix typo',
      at: '2026-11-05T09:00:00+01:00',
      checkout: 'main',
      files: { 'src/export.ts': 'a\nb\n' },
    },
    {
      message: 'Late evening fix',
      at: '2026-11-06T22:15:00+01:00',
      files: { 'README.md': 'Acme API\n' },
    },
    {
      message: 'Review notes from Malik',
      at: '2026-11-07T11:30:00+01:00',
      author: MALIK,
      files: { 'NOTES.md': 'Reviewed.\n' },
    },
  ],
};

export interface Fixture {
  readonly workspace: Workspace;
  readonly repoPath: string;
}

export async function createAcmeFixture(): Promise<Fixture> {
  const workspace = await createWorkspace();
  const repoPath = await createRepo(workspace, ACME_SPEC);
  return { workspace, repoPath };
}

/** Content hash of every file under `root`, used to prove a run changed nothing. */
export async function snapshotTree(root: string): Promise<Readonly<Record<string, string>>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, relative);
      else if (entry.isFile()) out[relative] = createHash('sha256').update(await readFile(full)).digest('hex');
    }
  };
  await walk(root, '');
  return out;
}

export async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

/** Builds options through the real parser, so tests exercise the CLI surface. */
export function buildOptions(argv: readonly string[]): CollectOptions {
  const parsed = parseArgv(argv);
  if (!parsed.ok) throw new Error(`usage error: ${parsed.errors.join('; ')}`);
  return parsed.value;
}

/** Records every write the collector performs; used to prove `--dry-run` writes nothing. */
export function recordingFs(writes: string[]): FsPort {
  const base = createNodeFs();
  return {
    ...base,
    async writeFile(path: string, data: string) {
      writes.push(path);
      await base.writeFile(path, data);
    },
    async rename(from: string, to: string) {
      writes.push(`${from} -> ${to}`);
      await base.rename(from, to);
    },
  };
}
