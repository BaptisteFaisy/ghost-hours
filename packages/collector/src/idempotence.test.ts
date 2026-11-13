import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from './index.ts';
import type { Fixture } from './test-support.ts';
import { buildOptions, createAcmeFixture } from './test-support.ts';

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const LATER = NOW + 60_000;

let fixture: Fixture;
let out: string;

beforeEach(async () => {
  fixture = await createAcmeFixture();
  out = join(fixture.workspace.root, 'out', 'evidence.json');
});

afterEach(async () => {
  await fixture.workspace.dispose();
});

function argvFor(extra: readonly string[]): readonly string[] {
  return ['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris', ...extra];
}

describe('HEU-P-14 — re-importing the same evidence leaves the state unchanged', () => {
  it('produces the same file byte for byte on two consecutive collections', async () => {
    const options = buildOptions(argvFor(['--author', 'sofia@example.com']));
    const first = await collect(options, { now: () => NOW });
    const firstBytes = await readFile(out, 'utf8');
    const second = await collect(options, { now: () => NOW });
    const secondBytes = await readFile(out, 'utf8');
    expect(second.fileText).toBe(first.fileText);
    expect(secondBytes).toBe(firstBytes);
  });

  it('changes nothing but collected_at when the clock moves', async () => {
    const options = buildOptions(argvFor([]));
    await collect(options, { now: () => NOW });
    const first = JSON.parse(await readFile(out, 'utf8')) as Record<string, unknown>;
    await collect(options, { now: () => LATER });
    const second = JSON.parse(await readFile(out, 'utf8')) as Record<string, unknown>;
    expect(second.collected_at).toBe(new Date(LATER).toISOString());
    expect({ ...second, collected_at: new Date(NOW).toISOString() }).toEqual(first);
  });

  it('HEU-P-14: any filter combination is stable across two runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          authors: fc.uniqueArray(
            fc.constantFrom('sofia@example.com', 'malik@example.org', 'Marquez', 'osei'),
            { maxLength: 2 },
          ),
          sinceDayKey: fc.constantFrom(null, '2026-11-01', '2026-11-04'),
          untilDayKey: fc.constantFrom(null, '2026-11-06', '2026-11-30'),
          summaries: fc.boolean(),
          excludes: fc.constantFrom<readonly string[]>([]),
        }),
        async (sample) => {
          const extra = [
            ...sample.authors.flatMap((author) => ['--author', author]),
            ...(sample.sinceDayKey === null ? [] : ['--since', sample.sinceDayKey]),
            ...(sample.untilDayKey === null ? [] : ['--until', sample.untilDayKey]),
            ...(sample.summaries ? [] : ['--no-summaries']),
          ];
          const options = buildOptions(argvFor(extra));
          const first = await collect(options, { now: () => NOW });
          const second = await collect(options, { now: () => NOW });
          return first.fileText === second.fileText && second.itemCount === first.itemCount;
        },
      ),
      { numRuns: 6 },
    );
  });
});
