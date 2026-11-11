import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from './index.ts';
import type { CollectReport } from './index.ts';
import type { Fixture } from './test-support.ts';
import { buildOptions, createAcmeFixture, readJson } from './test-support.ts';

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);

interface WireItem {
  readonly kind: string;
  readonly at?: string;
  readonly summary?: string;
  readonly authorEmail?: string;
}

let fixture: Fixture;
let out: string;

async function run(extra: readonly string[]): Promise<CollectReport> {
  return collect(
    buildOptions(['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris', ...extra]),
    { now: () => NOW },
  );
}

async function items(report: CollectReport): Promise<WireItem[]> {
  expect(report.wrote).toBe(true);
  const file = await readJson(out);
  return file.items as WireItem[];
}

beforeEach(async () => {
  fixture = await createAcmeFixture();
  out = join(fixture.workspace.root, 'out', 'evidence.json');
});

afterEach(async () => {
  await fixture.workspace.dispose();
});

describe('collect filters', () => {
  it('keeps every author when --author is absent', async () => {
    const found = await items(await run([]));
    expect(found.filter((item) => item.kind === 'commit')).toHaveLength(5);
  });

  it('filters on the email, case-insensitively', async () => {
    const found = await items(await run(['--author', 'SOFIA@EXAMPLE.COM']));
    const commits = found.filter((item) => item.kind === 'commit');
    expect(commits).toHaveLength(4);
    for (const commit of commits) expect(commit.authorEmail).toBe('sofia@example.com');
  });

  it('filters on the author name', async () => {
    const commits = (await items(await run(['--author', 'osei']))).filter((item) => item.kind === 'commit');
    expect(commits).toHaveLength(1);
    expect(commits[0]?.summary).toBe('Review notes from Malik');
  });

});

describe('collect filters — dates', () => {
  it('unions several --author values', async () => {
    const commits = (await items(await run(['--author', 'sofia', '--author', 'malik']))).filter(
      (item) => item.kind === 'commit',
    );
    expect(commits).toHaveLength(5);
  });

  it('bounds the window with --since and --until, on author dates', async () => {
    const since = (await items(await run(['--since', '2026-11-04']))).filter((item) => item.kind === 'commit');
    expect(since.map((item) => item.summary)).toEqual([
      'Wire export endpoint',
      'Fix typo',
      'Late evening fix',
      'Review notes from Malik',
    ]);

    const until = (await items(await run(['--until', '2026-11-04']))).filter((item) => item.kind === 'commit');
    expect(until.map((item) => item.summary)).toEqual(['Add CSV export', 'Wire export endpoint']);
  });

  it('keeps a single day when --since and --until name it', async () => {
    const found = await items(await run(['--since', '2026-11-05', '--until', '2026-11-05']));
    const commits = found.filter((item) => item.kind === 'commit');
    expect(commits.map((item) => item.summary)).toEqual(['Fix typo']);
    expect(found.filter((item) => item.kind === 'checkout')).toHaveLength(1);
  });

  it('resolves the day bounds in the requested time zone', async () => {
    // "Late evening fix" is 2026-11-06 22:15 in Paris but already 2026-11-07 in Tokyo,
    // so the same --until names a different last day in the two zones (HEU-N-02).
    const paris = await items(await run(['--until', '2026-11-06', '--timezone', 'Europe/Paris']));
    expect(paris.filter((item) => item.kind === 'commit')).toHaveLength(4);

    const tokyo = await items(await run(['--until', '2026-11-06', '--timezone', 'Asia/Tokyo']));
    expect(tokyo.filter((item) => item.kind === 'commit')).toHaveLength(3);
  });

});

describe('collect filters — summaries', () => {
  it('omits every summary with --no-summaries (HEU-N-07)', async () => {
    const found = await items(await run(['--no-summaries']));
    expect(found.length).toBeGreaterThan(0);
    for (const item of found) expect(item.summary).toBeUndefined();
  });

  it('keeps the summaries by default', async () => {
    const found = await items(await run([]));
    const summaries = found.filter((item) => item.kind === 'commit').map((item) => item.summary);
    expect(summaries).toContain('Add CSV export');
  });
});
