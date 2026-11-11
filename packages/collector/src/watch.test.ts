import { afterEach, describe, expect, it } from 'vitest';
import { main } from './cli.ts';
import { DEFAULT_INTERVAL_MS, parseInterval, watch } from './watch.ts';
import type { CollectReport } from './index.ts';
import { buildOptions, createAcmeFixture } from './test-support.ts';
import type { Fixture } from './test-support.ts';

/**
 * The periodic collection (idea D-01). The loop is tested with injected
 * timers and an injected collection, so no test waits for a real interval and
 * no repository is touched except in the two CLI tests at the end.
 */

const options = buildOptions(['collect', '/tmp/whatever', '--author', 'sofia@example.com']);

function report(items = 3): CollectReport {
  return {
    timeZone: 'Europe/Paris',
    repos: [],
    itemCount: items,
    commitCount: items,
    checkoutCount: 0,
    out: '/tmp/evidence.json',
    wrote: true,
    dryRun: false,
    warnings: [],
    fileText: '{}',
  };
}

interface Recorder {
  readonly sleeps: number[];
  readonly lines: string[];
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
}

function recorder(): Recorder {
  const sleeps: number[] = [];
  const lines: string[] = [];
  return {
    sleeps,
    lines,
    sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    log: (line: string) => {
      lines.push(line);
    },
  };
}

/** A handle that stops itself after `rounds` collections. */
function limited(rounds: number) {
  let done = 0;
  let stop = (): void => undefined;
  const collect = async (): Promise<CollectReport> => {
    done += 1;
    if (done >= rounds) stop();
    return report();
  };
  return { collect, rounds: () => done, bindStop: (fn: () => void) => { stop = fn; } };
}

describe('parseInterval', () => {
  it('reads seconds, minutes and hours', () => {
    expect(parseInterval('30s')).toBe(30_000);
    expect(parseInterval('15m')).toBe(900_000);
    expect(parseInterval('2h')).toBe(7_200_000);
    expect(parseInterval('90')).toBe(5_400_000);
    expect(parseInterval(' 5M ')).toBe(300_000);
  });

  it('refuses what it cannot read', () => {
    expect(parseInterval('0')).toBeNull();
    expect(parseInterval('-5m')).toBeNull();
    expect(parseInterval('abc')).toBeNull();
    expect(parseInterval('')).toBeNull();
  });
});

describe('watch — the loop', () => {
  it('collects immediately, then waits the interval', async () => {
    const rec = recorder();
    const runner = limited(3);
    const handle = watch({ ...options, intervalMs: 60_000 }, { collect: runner.collect, sleep: rec.sleep, log: rec.log });
    runner.bindStop(handle.stop);
    const summary = await handle.finished;
    expect(summary.rounds).toBe(3);
    expect(rec.sleeps).toEqual([60_000, 60_000]);
    expect(rec.lines.length).toBe(3);
  });

  it('defaults to one hour between rounds', async () => {
    const rec = recorder();
    const runner = limited(2);
    const handle = watch(options, { collect: runner.collect, sleep: rec.sleep, log: rec.log });
    runner.bindStop(handle.stop);
    await handle.finished;
    expect(rec.sleeps).toEqual([DEFAULT_INTERVAL_MS]);
  });

  it('stops after one round with --once', async () => {
    const rec = recorder();
    let calls = 0;
    const summary = await watch(
      { ...options, once: true },
      { collect: async () => { calls += 1; return report(); }, sleep: rec.sleep, log: rec.log },
    ).finished;
    expect(calls).toBe(1);
    expect(rec.sleeps).toEqual([]);
    expect(summary.rounds).toBe(1);
  });

});

describe('watch — failures and overlap', () => {
  it('keeps going after a failure and counts it', async () => {
    const rec = recorder();
    let calls = 0;
    const handle = watch(
      { ...options, intervalMs: 1 },
      {
        collect: async () => {
          calls += 1;
          if (calls === 1) throw new Error('git exploded');
          if (calls >= 3) handle.stop();
          return report();
        },
        sleep: rec.sleep,
        log: rec.log,
      },
    );
    const summary = await handle.finished;
    expect(summary.failures).toBe(1);
    expect(summary.rounds).toBe(2);
    expect(rec.lines.some((line) => line.includes('git exploded'))).toBe(true);
  });

});

describe('watch — serialization and stop', () => {
  it('never overlaps two collections', async () => {
    let running = 0;
    let overlap = 0;
    let calls = 0;
    const handle = watch(
      { ...options, intervalMs: 0 },
      {
        collect: async () => {
          running += 1;
          if (running > 1) overlap += 1;
          await Promise.resolve();
          running -= 1;
          calls += 1;
          if (calls >= 4) handle.stop();
          return report();
        },
        sleep: async () => undefined,
      },
    );
    await handle.finished;
    expect(overlap).toBe(0);
    expect(calls).toBe(4);
  });

  it('stops before the next round when asked', async () => {
    const rec = recorder();
    const handle = watch(
      { ...options, intervalMs: 1 },
      { collect: async () => report(), sleep: rec.sleep, log: rec.log },
    );
    handle.stop();
    const summary = await handle.finished;
    expect(summary.rounds).toBe(1);
    expect(summary.stopped).toBe(true);
  });
});

describe('watch — through the CLI', () => {
  let fixture: Fixture | null = null;

  afterEach(async () => {
    if (fixture !== null) await fixture.workspace.dispose();
    fixture = null;
  });

  it('runs one round with --once and reports it', async () => {
    fixture = await createAcmeFixture();
    const lines: string[] = [];
    const code = await main(
      [
        'watch',
        fixture.repoPath,
        '--author',
        'sofia@example.com',
        '--once',
        '--out',
        `${fixture.workspace.root}/evidence.json`,
      ],
      { out: (text) => lines.push(text), err: (text) => lines.push(text) },
    );
    expect(code).toBe(0);
    expect(lines.join('')).toContain('collected');
    expect(lines.join('')).toContain('watch stopped after 1 round(s)');
  });

  it('refuses an interval it cannot read', async () => {
    fixture = await createAcmeFixture();
    const lines: string[] = [];
    const code = await main(
      ['watch', fixture.repoPath, '--interval', 'bientot'],
      { out: (text) => lines.push(text), err: (text) => lines.push(text) },
    );
    expect(code).toBe(2);
    expect(lines.join('')).toContain('--interval');
  });
});
