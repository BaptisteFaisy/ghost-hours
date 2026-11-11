import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from './index.ts';
import { createGitRunner } from './git.ts';
import { assertRepoUnchanged, fingerprintRepo, ReadOnlyViolation } from './readonly-guard.ts';
import type { Fixture } from './test-support.ts';
import { buildOptions, createAcmeFixture, runGit, snapshotTree } from './test-support.ts';

/**
 * HEU-F-01 and the acceptance recipe D.17: "the collector modifies no
 * repository: the state of every repository is identical before and after".
 */

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);

let fixture: Fixture;
let out: string;

beforeEach(async () => {
  fixture = await createAcmeFixture();
  out = join(fixture.workspace.root, 'out', 'evidence.json');
});

afterEach(async () => {
  await fixture.workspace.dispose();
});

describe('read-only guarantee', () => {
  it('leaves every file of the repository byte-identical (D.17)', async () => {
    const before = await snapshotTree(fixture.repoPath);
    await collect(
      buildOptions(['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris']),
      { now: () => NOW },
    );
    const after = await snapshotTree(fixture.repoPath);
    expect(after).toEqual(before);
  });

  it('leaves the working tree clean', async () => {
    await collect(buildOptions(['collect', fixture.repoPath, '--out', out, '--no-summaries']), {
      now: () => NOW,
    });
    expect(await runGit(['status', '--porcelain'], fixture.repoPath)).toBe('');
  });

  it('keeps HEAD, the branch and the status fingerprint identical', async () => {
    const run = createGitRunner();
    const before = await fingerprintRepo(run, fixture.repoPath);
    expect(before.head).toMatch(/^[0-9a-f]{40}$/);
    expect(before.branch).toBe('main');
    expect(before.status).toBe('');
    await collect(buildOptions(['collect', fixture.repoPath, '--out', out]), { now: () => NOW });
    expect(await fingerprintRepo(run, fixture.repoPath)).toEqual(before);
  });

  it('does not touch the repository when the output file lives inside it', async () => {
    const inside = join(fixture.repoPath, 'evidence.json');
    const before = await snapshotTree(fixture.repoPath);
    await collect(buildOptions(['collect', fixture.repoPath, '--out', inside]), { now: () => NOW });
    const after = await snapshotTree(fixture.repoPath);
    expect(Object.keys(after).filter((path) => !(path in before))).toEqual(['evidence.json']);
    expect(await runGit(['status', '--porcelain'], fixture.repoPath)).toBe('?? evidence.json\n');
  });

  it('reports a changed fingerprint instead of ignoring it', async () => {
    const run = createGitRunner();
    const before = await fingerprintRepo(run, fixture.repoPath);
    await runGit(['commit', '--allow-empty', '-m', 'moved on'], fixture.repoPath, {
      GIT_AUTHOR_DATE: '2026-11-10T10:00:00+01:00',
      GIT_COMMITTER_DATE: '2026-11-10T10:00:00+01:00',
    });
    const after = await fingerprintRepo(run, fixture.repoPath);
    expect(() => assertRepoUnchanged(fixture.repoPath, before, after)).toThrow(ReadOnlyViolation);
    expect(() => assertRepoUnchanged(fixture.repoPath, before, before)).not.toThrow();
  });
});
