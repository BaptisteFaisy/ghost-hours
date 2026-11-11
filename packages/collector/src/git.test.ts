import { describe, expect, it } from 'vitest';
import { buildLogArgs } from './commits.ts';
import {
  assertReadOnlyCommand,
  createGitRunner,
  GitReadOnlyError,
  normalizeRemoteUrl,
  readRemoteUrl,
} from './git.ts';
import { buildReflogArgs } from './reflog.ts';
import type { Fixture } from './test-support.ts';
import { createAcmeFixture, runGit } from './test-support.ts';

describe('assertReadOnlyCommand', () => {
  it('accepts every command the collector runs', () => {
    const allowed = [
      ['rev-parse', 'HEAD'],
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      ['status', '--porcelain'],
      ['config', '--get', 'remote.origin.url'],
      ['for-each-ref', '--format=%(refname)'],
      buildLogArgs({ authors: ['sofia@example.com'], since: null, until: null, summaries: true }),
      buildLogArgs({ authors: [], since: null, until: null, summaries: false }),
      buildReflogArgs(),
    ];
    for (const args of allowed) expect(() => assertReadOnlyCommand(args)).not.toThrow();
  });

  it('refuses every subcommand that writes', () => {
    const forbidden = [
      ['fetch', '--all'],
      ['pull'],
      ['gc', '--prune=now'],
      ['prune'],
      ['commit', '-m', 'x'],
      ['checkout', 'main'],
      ['reset', '--hard'],
      ['stash', 'push'],
      ['update-ref', 'refs/heads/main', 'HEAD'],
      ['filter-branch', '--all'],
      ['repack', '-ad'],
      ['worktree', 'add', '/tmp/x'],
    ];
    for (const args of forbidden) expect(() => assertReadOnlyCommand(args)).toThrow(GitReadOnlyError);
  });

  it('refuses arguments that write or execute', () => {
    expect(() => assertReadOnlyCommand(['log', '--output=/tmp/leak.txt'])).toThrow(/writes a file/);
    expect(() => assertReadOnlyCommand(['log', '--exec=rm -rf /'])).toThrow(/writes a file/);
    expect(() => assertReadOnlyCommand(['config', 'user.name', 'Eve'])).toThrow(/only allowed with --get/);
    expect(() => assertReadOnlyCommand(['status'])).toThrow(/only allowed with --porcelain/);
    expect(() => assertReadOnlyCommand(['reflog', 'expire', '--all'])).toThrow(/rewrites the journal/);
    expect(() => assertReadOnlyCommand(['--no-pager'])).toThrow(/no git subcommand/);
    expect(() => assertReadOnlyCommand(['shortlogx'])).toThrow(/only reads/);
  });

  it('sees through global value flags', () => {
    expect(() => assertReadOnlyCommand(['-c', 'core.pager=cat', 'log'])).not.toThrow();
    expect(() => assertReadOnlyCommand(['-c', 'core.pager=cat', 'gc'])).toThrow(GitReadOnlyError);
  });
});

describe('normalizeRemoteUrl', () => {
  it('reduces every common remote form to host/path', () => {
    expect(normalizeRemoteUrl('git@example.com:acme/api.git')).toBe('example.com/acme/api');
    expect(normalizeRemoteUrl('https://example.com/acme/api.git')).toBe('example.com/acme/api');
    expect(normalizeRemoteUrl('ssh://git@example.com/acme/api.git')).toBe('example.com/acme/api');
    expect(normalizeRemoteUrl('https://user:secret@example.com/acme/api')).toBe('example.com/acme/api');
  });
});

describe('createGitRunner', () => {
  it('reads a repository and refuses to write to it', async () => {
    const fixture: Fixture = await createAcmeFixture();
    try {
      const run = createGitRunner();
      const head = (await run(['rev-parse', 'HEAD'], fixture.repoPath)).trim();
      expect(head).toMatch(/^[0-9a-f]{40}$/);
      await expect(run(['commit', '--allow-empty', '-m', 'nope'], fixture.repoPath)).rejects.toThrow(
        GitReadOnlyError,
      );
      expect((await run(['rev-parse', 'HEAD'], fixture.repoPath)).trim()).toBe(head);
    } finally {
      await fixture.workspace.dispose();
    }
  });

  it('reads the origin url, and returns null when there is none', async () => {
    const fixture: Fixture = await createAcmeFixture();
    try {
      const run = createGitRunner();
      expect(await readRemoteUrl(run, fixture.repoPath)).toBeNull();
      await runGit(['remote', 'add', 'origin', 'git@example.com:acme/api.git'], fixture.repoPath);
      expect(await readRemoteUrl(run, fixture.repoPath)).toBe('example.com/acme/api');
    } finally {
      await fixture.workspace.dispose();
    }
  });
});
