import type { CollectOptions } from './options.ts';
import { collect } from './index.ts';
import type { CollectReport } from './index.ts';

/**
 * Periodic collection (idea D-01).
 *
 * The reference journal (`git reflog`) is local and expires after a few months,
 * and it is the only thing that tells the reconstruction where a session really
 * began. Collecting once at the end of the month is therefore too late: this
 * loop re-reads the repositories on a fixed interval, always read-only.
 *
 * The loop **awaits** each round, so a slow collection delays the next one
 * instead of overlapping it — two collections of the same repository at once
 * would be the only way to break the read-only guarantee by accident.
 */

export interface WatchDeps {
  /** One collection; injectable so tests never touch a repository. */
  readonly collect?: (options: CollectOptions) => Promise<CollectReport>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

export interface WatchSummary {
  readonly rounds: number;
  readonly failures: number;
  readonly stopped: boolean;
}

export interface WatchHandle {
  /** Ask the loop to stop after the round in flight, if any. */
  stop: () => void;
  readonly finished: Promise<WatchSummary>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function watch(options: CollectOptions, deps: WatchDeps = {}): WatchHandle {
  const runCollect = deps.collect ?? ((value: CollectOptions) => collect(value));
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((): void => undefined);
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;

  const finished = (async (): Promise<WatchSummary> => {
    let rounds = 0;
    let failures = 0;
    for (;;) {
      const outcome = await runRound(runCollect, options, log, now);
      if (outcome === 'ok') rounds += 1;
      else failures += 1;
      if (stopped || options.once === true) break;
      await sleep(intervalMs);
    }
    return { rounds, failures, stopped };
  })();

  return {
    stop: () => {
      stopped = true;
    },
    finished,
  };
}

export const DEFAULT_INTERVAL_MS = 3_600_000;

type RoundOutcome = 'ok' | 'failure';

/** One collection, reported; an error never kills the loop. */
async function runRound(
  runCollect: (options: CollectOptions) => Promise<CollectReport>,
  options: CollectOptions,
  log: (line: string) => void,
  now: () => number,
): Promise<RoundOutcome> {
  const stamp = new Date(now()).toISOString();
  try {
    const report = await runCollect(options);
    const failed = report.repos.filter((repo) => repo.error !== null).length;
    log(
      `${stamp} collected ${report.itemCount} item(s) from ${report.repos.length} repository(ies)` +
        (failed > 0 ? `, ${failed} unreadable` : '') +
        (report.out === null ? '' : ` -> ${report.out}`),
    );
    for (const warning of report.warnings) log(`${stamp} warning: ${warning}`);
    return 'ok';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`${stamp} collection failed: ${message}`);
    return 'failure';
  }
}

export { parseInterval } from './options.ts';
