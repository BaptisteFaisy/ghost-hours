import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkoutEvidenceId, commitEvidenceId } from '@ghost-hours/core';
import { collect } from './index.ts';
import type { CollectReport } from './index.ts';
import type { Fixture } from './test-support.ts';
import { buildOptions, createAcmeFixture, createRepo, readJson, recordingFs, runGit } from './test-support.ts';

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const ACME = 'acme-api';

interface WireItem {
  readonly id: string;
  readonly kind: string;
  readonly at?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly summary?: string;
  readonly added?: number;
  readonly deleted?: number;
  readonly authorEmail?: string;
  readonly to?: string;
  readonly from?: string;
}

let fixture: Fixture;
let out: string;

async function collectAcme(extra: readonly string[] = []): Promise<CollectReport> {
  return collect(
    buildOptions(['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris', ...extra]),
    { now: () => NOW },
  );
}

async function readItems(): Promise<WireItem[]> {
  const file = await readJson(out);
  return file.items as WireItem[];
}

async function commitNamed(summary: string): Promise<WireItem> {
  const found = (await readItems()).find((item) => item.kind === 'commit' && item.summary === summary);
  if (found === undefined) throw new Error(`no commit summary: ${summary}`);
  return found;
}

beforeEach(async () => {
  fixture = await createAcmeFixture();
  out = join(fixture.workspace.root, 'out', 'evidence.json');
});

afterEach(async () => {
  await fixture.workspace.dispose();
});

describe('collect', () => {
  it('finds the commits of the selected author and the branch switches', async () => {
    const report = await collectAcme(['--author', 'sofia@example.com']);
    expect(report.repos).toHaveLength(1);
    expect(report.repos[0]?.error).toBeNull();
    expect(report.repos[0]?.commitCount).toBe(4);
    expect(report.repos[0]?.checkoutCount).toBe(2);
    expect(report.itemCount).toBe(6);
    expect(report.wrote).toBe(true);
    expect(report.out).toBe(out);
  });

  it('builds deterministic ids from the repository name and the sha', async () => {
    await collectAcme(['--author', 'sofia@example.com']);
    const items = await readItems();
    const shas = (await runGit(['log', '--all', '--format=%H'], fixture.repoPath)).trim().split('\n');
    const expected = new Set(shas.map((sha) => commitEvidenceId(ACME, sha)));
    const commitIds = items.filter((item) => item.kind === 'commit').map((item) => item.id);
    expect(commitIds).toHaveLength(4);
    for (const id of commitIds) {
      expect(expected.has(id)).toBe(true);
      expect(id).toMatch(/^git:acme-api:[0-9a-f]{12}$/);
    }
    expect(new Set(commitIds).size).toBe(commitIds.length);
  });

  it('records author dates, line counts and branches', async () => {
    await collectAcme(['--author', 'sofia@example.com']);
    const first = await commitNamed('Add CSV export');
    expect(first.at).toBe('2026-11-03T08:00:00.000Z');
    expect(first.added).toBe(3);
    expect(first.deleted).toBe(0);
    expect(first.authorEmail).toBe('sofia@example.com');
    expect(first.branch).toBe('main');
    expect(first.repo).toBe(ACME);
  });

  it('counts added and deleted lines, and follows branches', async () => {
    await collectAcme(['--author', 'sofia@example.com']);
    const reverted = await commitNamed('Fix typo');
    expect(reverted.added).toBe(0);
    expect(reverted.deleted).toBe(1);
    expect((await commitNamed('Wire export endpoint')).branch).toBe('feat/export');
    expect((await commitNamed('Late evening fix')).at).toBe('2026-11-06T21:15:00.000Z');
  });

});

describe('collect — checkout evidence', () => {
  it('records branch switches with stable ids', async () => {
    await collectAcme(['--author', 'sofia@example.com']);
    const checkouts = (await readItems()).filter((item) => item.kind === 'checkout');
    expect(checkouts).toHaveLength(2);
    expect(checkouts.map((item) => [item.from, item.to])).toEqual([
      ['main', 'feat/export'],
      ['feat/export', 'main'],
    ]);
    for (const item of checkouts) {
      expect(item.id).toBe(checkoutEvidenceId(ACME, Date.parse(item.at ?? ''), item.to ?? ''));
    }
  });

});

describe('collect — repository discovery', () => {
  it('sorts items by instant, then by id', async () => {
    await collectAcme(['--author', 'sofia@example.com']);
    const keys = (await readItems()).map((item) => [Date.parse(item.at ?? ''), item.id] as const);
    const sorted = [...keys].sort((left, right) =>
      left[0] !== right[0] ? left[0] - right[0] : left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0,
    );
    expect(keys).toEqual(sorted);
  });

  it('scans a folder and finds every repository under it', async () => {
    await createRepo(fixture.workspace, {
      name: 'northwind-portal',
      commits: [
        { message: 'Add portal shell', at: '2026-11-08T14:00:00+01:00', files: { 'index.html': '<main></main>\n' } },
      ],
    });
    const report = await collect(
      buildOptions([
        'collect',
        fixture.workspace.root,
        '--out',
        out,
        '--timezone',
        'Europe/Paris',
        '--author',
        'sofia@example.com',
      ]),
      { now: () => NOW },
    );
    expect(report.repos.map((repo) => repo.name)).toEqual(['acme-api', 'northwind-portal']);
    expect(report.commitCount).toBe(5);
    expect(report.warnings).toEqual([]);
  });

  it('lets --repo replace the folder scan', async () => {
    await createRepo(fixture.workspace, {
      name: 'globex-etl',
      commits: [{ message: 'Add loader', at: '2026-11-09T08:00:00+01:00', files: { 'load.py': 'print(1)\n' } }],
    });
    const report = await collect(
      buildOptions(['collect', fixture.workspace.root, '--repo', fixture.repoPath, '--out', out]),
      { now: () => NOW },
    );
    expect(report.repos).toHaveLength(1);
    expect(report.repos[0]?.name).toBe(ACME);
    expect(report.commitCount).toBe(5);
  });

});

describe('collect — output', () => {
  it('writes the evidence file with the documented envelope', async () => {
    await collectAcme();
    const file = await readJson(out);
    expect(file.version).toBe(1);
    // On the wire an instant is an ISO-8601 string (spec D.10).
    expect(file.collected_at).toBe(new Date(NOW).toISOString());
    expect(file.timeZone).toBe('Europe/Paris');
    expect(String(file.generator)).toContain('ghost-hours-collector@');
    const repos = file.repos as readonly { name: string; commitCount: number; reflogEntries: number }[];
    expect(repos[0]).toEqual(expect.objectContaining({ name: ACME, commitCount: 5, reflogEntries: 2 }));
    expect((await readFile(out, 'utf8')).endsWith('}\n')).toBe(true);
  });

  it('writes through a temporary file and renames it', async () => {
    const writes: string[] = [];
    const report = await collect(
      buildOptions(['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris']),
      { now: () => NOW, fs: recordingFs(writes) },
    );
    expect(report.wrote).toBe(true);
    expect(writes).toEqual([`${out}.tmp`, `${out}.tmp -> ${out}`]);
  });

  it('writes nothing during a dry run', async () => {
    const writes: string[] = [];
    const report = await collect(
      buildOptions(['collect', fixture.repoPath, '--out', out, '--dry-run']),
      { now: () => NOW, fs: recordingFs(writes) },
    );
    expect(writes).toEqual([]);
    expect(report.dryRun).toBe(true);
    expect(report.wrote).toBe(false);
    expect(report.out).toBeNull();
    expect(report.commitCount).toBe(5);
    await expect(readFile(out, 'utf8')).rejects.toThrow();
  });

  it('writes nothing when the report goes to stdout', async () => {
    const writes: string[] = [];
    const report = await collect(buildOptions(['collect', fixture.repoPath, '--out', out, '--json']), {
      now: () => NOW,
      fs: recordingFs(writes),
    });
    expect(writes).toEqual([]);
    expect(report.out).toBeNull();
    expect(report.fileText).toContain('"items"');
  });
});
