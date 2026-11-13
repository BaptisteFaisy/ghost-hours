import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { CollectDeps, CollectReport } from './index.ts';
import { collect } from './index.ts';
import { CLI_NAME, HELP_TEXT, parseArgv } from './options.ts';
import type { CollectOptions } from './options.ts';
import { watch } from './watch.ts';
import { VERSION } from './version.ts';

export interface CliStreams {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

export const defaultStreams: CliStreams = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repoLine(report: CollectReport['repos'][number]): string {
  const counts = `${report.commitCount} commit(s), ${report.checkoutCount} checkout(s)`;
  if (report.error !== null) return `  ${report.name}  ${report.path}  ERROR ${report.error}`;
  return `  ${report.name}  ${report.path}  ${counts}`;
}

export function formatReport(report: CollectReport): string {
  const lines = [`${CLI_NAME} — ${report.repos.length} repository(ies), time zone ${report.timeZone}`];
  for (const repo of report.repos) lines.push(repoLine(repo));
  lines.push(
    `evidence: ${report.itemCount} item(s) — ${report.commitCount} commit(s), ${report.checkoutCount} checkout(s)`,
  );
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  if (report.dryRun) lines.push('dry run: nothing written');
  else if (report.out !== null) lines.push(`wrote ${report.out}`);
  else if (report.repos.some((repo) => repo.error !== null)) {
    lines.push('not written: a repository could not be read, fix it and run again');
  }
  return `${lines.join('\n')}\n`;
}

function usageError(errors: readonly string[], streams: CliStreams): number {
  for (const error of errors) streams.err(`${CLI_NAME}: ${error}\n`);
  streams.err(`\nTry "${CLI_NAME} --help" for usage.\n`);
  return 2;
}

async function run(options: ReturnType<typeof parseArgv>, streams: CliStreams, deps: CollectDeps): Promise<number> {
  if (!options.ok) return usageError(options.errors, streams);
  const parsed = options.value;
  if (parsed.help) {
    streams.out(HELP_TEXT);
    return 0;
  }
  if (parsed.version) {
    streams.out(`${CLI_NAME} ${VERSION}\n`);
    return 0;
  }
  if (parsed.command === 'watch') return runWatch(parsed, streams, deps);
  let report: CollectReport;
  try {
    report = await collect(parsed, deps);
  } catch (error) {
    streams.err(`${CLI_NAME}: collection failed: ${describe(error)}\n`);
    return 1;
  }
  if (parsed.json) {
    streams.out(report.fileText);
    for (const warning of report.warnings) streams.err(`warning: ${warning}\n`);
  } else {
    streams.out(formatReport(report));
  }
  const failed = report.repos.some((repo) => repo.error !== null);
  const foundNothing = report.repos.length === 0;
  return failed || foundNothing ? 1 : 0;
}

/** CLI entry point. Returns the process exit code: 0 success, 1 failure, 2 usage. */
/**
 * Periodic collection (idea D-01). The loop lives in `watch.ts`; this only
 * wires the streams, the optional log file and the signals.
 */
async function runWatch(
  parsed: CollectOptions,
  streams: CliStreams,
  deps: CollectDeps,
): Promise<number> {
  const log = (line: string): void => {
    streams.out(`${line}\n`);
    if (parsed.logFile === undefined || parsed.logFile === null) return;
    try {
      appendFileSync(parsed.logFile, `${line}\n`);
    } catch (error) {
      streams.err(`${CLI_NAME}: cannot write the log file: ${describe(error)}\n`);
    }
  };
  const handle = watch(parsed, {
    now: deps.now,
    log,
    collect: (options) => collect(options, deps),
  });
  stopOnSignal(handle.stop);
  const summary = await handle.finished;
  streams.out(
    `${CLI_NAME}: watch stopped after ${summary.rounds} round(s), ${summary.failures} failure(s)\n`,
  );
  return summary.rounds === 0 && summary.failures > 0 ? 1 : 0;
}

/** Ctrl-C ends the round in flight, then exits cleanly: never mid-write. */
function stopOnSignal(stop: () => void): void {
  if (typeof process === 'undefined' || typeof process.once !== 'function') return;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => stop());
  }
}

export async function main(
  argv: readonly string[],
  streams: CliStreams = defaultStreams,
  deps: CollectDeps = {},
): Promise<number> {
  return run(parseArgv(argv), streams, deps);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${CLI_NAME}: ${describe(error)}\n`);
      process.exitCode = 1;
    },
  );
}
