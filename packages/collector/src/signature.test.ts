import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommitFilter } from './commits.ts';
import { buildLogArgs, readCommits } from './commits.ts';
import { commitToEvidence } from './evidence.ts';
import { assertReadOnlyCommand, createGitRunner, WRITE_SUBCOMMANDS } from './git.ts';
import type { Fixture, Workspace } from './test-support.ts';
import { createAcmeFixture, createRepo, createWorkspace, gitEnv, runGit, runTool } from './test-support.ts';

/**
 * The signature fields (`%G?`, `%GS`, `%GK`, `%ce`, `%cI`) are what turns a
 * commit from a time-stamp claim into a *checkable* claim: Git's own letter
 * tells whether it is signed and whether the key is trusted, and the committer
 * distinguishes an original commit from a rewritten one. These tests hold the
 * collector to the read-only promise while it reads all five.
 */

const ALL: CommitFilter = { authors: [], since: null, until: null, summaries: true };

function signable(): boolean {
  if (spawnSync('ssh-keygen', ['-h']).error !== undefined) return false;
  const version = spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout ?? '';
  const match = /git version (\d+)\.(\d+)/.exec(version);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 34);
}

describe('buildLogArgs', () => {
  it('asks Git for the signature, the signer, the key, the committer and the commit instant', () => {
    const args = buildLogArgs(ALL);
    const format = args.find((arg) => arg.startsWith('--pretty=format:')) ?? '';
    for (const placeholder of ['%G?', '%GS', '%GK', '%ce', '%cI']) {
      expect(format).toContain(placeholder);
    }
  });

  it('stays read-only and never asks Git to display the signature', () => {
    const args = buildLogArgs(ALL);
    expect(args).toContain('--no-show-signature');
    for (const arg of args) expect(WRITE_SUBCOMMANDS).not.toContain(arg);
    expect(() => assertReadOnlyCommand(args)).not.toThrow();
  });

  it('never reads the subject when summaries are off', () => {
    const args = buildLogArgs({ authors: [], since: null, until: null, summaries: false });
    const format = args.find((arg) => arg.startsWith('--pretty=format:')) ?? '';
    expect(format).not.toContain('%s');
  });
});

/** Creates a repository whose single commit is signed with a trusted SSH key. */
async function createSignedRepo(workspace: Workspace): Promise<string> {
  const repoPath = await createRepo(workspace, { name: 'signed', commits: [] });
  const keyPath = join(workspace.root, 'signing-key');
  await runTool(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', keyPath], workspace.root);
  const allowed = join(workspace.root, 'allowed-signers');
  await writeFile(allowed, `sofia@example.com ${await readFile(`${keyPath}.pub`, 'utf8')}`);
  const env = gitEnv(workspace);
  await runGit(['config', 'gpg.format', 'ssh'], repoPath, env);
  await runGit(['config', 'user.signingkey', keyPath], repoPath, env);
  await runGit(['config', 'gpg.ssh.allowedSignersFile', allowed], repoPath, env);
  await runGit(['config', 'commit.gpgsign', 'true'], repoPath, env);
  await writeFile(join(repoPath, 'signed.txt'), 'signed\n', 'utf8');
  await runGit(['add', 'signed.txt'], repoPath, env);
  await runGit(['commit', '-S', '-m', 'Signed work'], repoPath, env);
  return repoPath;
}

describe('readCommits — unsigned commits', () => {
  it('marks an unsigned commit as N and keeps its committer', async () => {
    const fixture: Fixture = await createAcmeFixture();
    try {
      const commits = await readCommits(createGitRunner(), fixture.repoPath, ALL);
      expect(commits.length).toBeGreaterThan(0);
      for (const commit of commits) {
        expect(commit.signature).toBe('N');
        expect(commit.signer).toBeNull();
        expect(commit.keyFingerprint).toBeNull();
        // Every commit is committed by the repository's own identity, even the one authored by Malik.
        expect(commit.committerEmail).toBe('sofia@example.com');
        expect(commit.committedAt).toBe(commit.authorAt);
      }
    } finally {
      await fixture.workspace.dispose();
    }
  });

  it('tells the committer from the author on a multi-author repository', async () => {
    const fixture: Fixture = await createAcmeFixture();
    try {
      const commits = await readCommits(createGitRunner(), fixture.repoPath, ALL);
      const byMalik = commits.find((commit) => commit.authorEmail === 'malik@example.org');
      expect(byMalik).toBeDefined();
      expect(byMalik?.committerEmail).toBe('sofia@example.com');
    } finally {
      await fixture.workspace.dispose();
    }
  });
});

describe('readCommits — rewritten commits', () => {
  it('keeps the author and moves the commit instant when the history is rewritten', async () => {
    const workspace = await createWorkspace();
    try {
      const repoPath = await createRepo(workspace, {
        name: 'replayed',
        commits: [{ message: 'First', at: '2026-11-03T09:00:00+01:00', files: { 'a.txt': 'a\n' } }],
      });
      // Rewriting does not touch the author; `commit --amend` only moves the committer instant.
      await runGit(
        ['commit', '--amend', '--no-edit', '--no-gpg-sign', '--allow-empty'],
        repoPath,
        gitEnv(workspace, { GIT_COMMITTER_DATE: '2026-11-20T09:00:00+01:00' }),
      );
      const commits = await readCommits(createGitRunner(), repoPath, ALL);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.authorEmail).toBe('sofia@example.com');
      expect(commits[0]?.authorAt).toBe(Date.parse('2026-11-03T09:00:00+01:00'));
      expect(commits[0]?.committedAt).toBe(Date.parse('2026-11-20T09:00:00+01:00'));
    } finally {
      await workspace.dispose();
    }
  });

  it.skipIf(!signable())('reports G with the signer and key of a trusted SSH signature', async () => {
    const workspace = await createWorkspace();
    try {
      const repoPath = await createSignedRepo(workspace);
      const commits = await readCommits(createGitRunner(), repoPath, ALL);
      expect(commits).toHaveLength(1);
      expect(commits[0]?.signature).toBe('G');
      expect(commits[0]?.signer).toBe('sofia@example.com');
      expect(commits[0]?.keyFingerprint).toMatch(/^SHA256:/);
    } finally {
      await workspace.dispose();
    }
  });
});

describe('commitToEvidence', () => {
  it('carries the signature, committer and commit instant onto the evidence', async () => {
    const fixture: Fixture = await createAcmeFixture();
    try {
      const commits = await readCommits(createGitRunner(), fixture.repoPath, ALL);
      const first = commits[0];
      expect(first).toBeDefined();
      const evidence = commitToEvidence({ repo: 'acme-api', remote: null, commit: first!, summaries: true });
      expect(evidence.signature).toBe('N');
      expect(evidence.signer).toBeUndefined();
      expect(evidence.keyFingerprint).toBeUndefined();
      expect(evidence.committerEmail).toBe('sofia@example.com');
      expect(evidence.committedAt).toBe(first!.authorAt);
    } finally {
      await fixture.workspace.dispose();
    }
  });
});