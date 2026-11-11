import type { ParseResult } from '@ghost-hours/core';
import { err, ok, parseDayKey } from '@ghost-hours/core';

/** Everything `ghost-hours collect` needs, fully resolved (specification D.7, path P1). */
export interface CollectOptions {
  readonly command: 'collect';
  /** Folders scanned for repositories. */
  readonly dirs: readonly string[];
  /** Author needles: case-insensitive substrings matched against name and email. */
  readonly authors: readonly string[];
  /** Local calendar day, `YYYY-MM-DD`, inclusive. */
  readonly sinceDayKey: string | null;
  /** Local calendar day, `YYYY-MM-DD`, inclusive. */
  readonly untilDayKey: string | null;
  readonly out: string;
  /** Explicit repositories; when non-empty they replace the folder scan. */
  readonly repos: readonly string[];
  readonly excludes: readonly string[];
  readonly maxDepth: number;
  /** False with `--no-summaries`: commit subjects are never read (HEU-N-07). */
  readonly summaries: boolean;
  readonly timeZone: string;
  readonly json: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export const CLI_NAME = 'ghost-hours';
export const DEFAULT_OUT = 'evidence.json';
export const DEFAULT_MAX_DEPTH = 4;
export const MAX_DEPTH_LIMIT = 32;

export const HELP_TEXT = `Ghost Hours — read-only Git collector

Usage:
  ${CLI_NAME} collect <dir...> [options]

Scans the given folders for Git repositories, reads the commits of the selected
authors on every reference plus the reference journal (reflog), and writes an
evidence file. Nothing is ever written to a repository (HEU-F-01).

Options:
  --author <email|name>  keep commits whose author name or email contains this
                         substring, case-insensitive; repeatable
  --since <YYYY-MM-DD>   keep commits authored on or after this local day
  --until <YYYY-MM-DD>   keep commits authored on or before this local day
  --out <file>           evidence file to write (default: ${DEFAULT_OUT})
  --repo <path>          collect this repository only; repeatable, and it
                         replaces the folder scan
  --exclude <glob>       skip matching folders while scanning; repeatable
  --max-depth <n>        folder levels scanned below each root (default: ${DEFAULT_MAX_DEPTH})
  --no-summaries         never read commit summaries (HEU-N-07)
  --timezone <IANA>      zone used for --since/--until and written in the file
                         (default: this machine's zone)
  --json                 print the evidence file on stdout instead of writing it
  --dry-run              list repositories and count evidence, write nothing
  --help                 show this help and exit
  --version              print the version and exit

Exit codes:
  0  success
  1  runtime failure, or nothing collected (unreadable repository,
     folder without a repository, write error, ...)
  2  usage error
`;

type ValueKey =
  | 'authors'
  | 'sinceDayKey'
  | 'untilDayKey'
  | 'out'
  | 'repos'
  | 'excludes'
  | 'maxDepth'
  | 'timeZone';

type FlagKey = 'summaries' | 'json' | 'dryRun';

const VALUE_OPTIONS: Readonly<Record<string, ValueKey>> = {
  '--author': 'authors',
  '--since': 'sinceDayKey',
  '--until': 'untilDayKey',
  '--out': 'out',
  '--repo': 'repos',
  '--exclude': 'excludes',
  '--max-depth': 'maxDepth',
  '--timezone': 'timeZone',
};

const FLAG_OPTIONS: Readonly<Record<string, FlagKey>> = {
  '--no-summaries': 'summaries',
  '--json': 'json',
  '--dry-run': 'dryRun',
};

interface ParseState {
  dirs: string[];
  authors: string[];
  sinceDayKey: string | null;
  untilDayKey: string | null;
  out: string;
  repos: string[];
  excludes: string[];
  maxDepth: number;
  summaries: boolean;
  json: boolean;
  dryRun: boolean;
  timeZone: string;
}

/** The zone of the machine running the collection (HEU-N-02: always explicit). */
export function defaultTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone.length > 0 ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `YYYY-MM-DD` naming a real calendar day. */
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDayKey(value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

function emptyState(): ParseState {
  return {
    dirs: [],
    authors: [],
    sinceDayKey: null,
    untilDayKey: null,
    out: DEFAULT_OUT,
    repos: [],
    excludes: [],
    maxDepth: DEFAULT_MAX_DEPTH,
    summaries: true,
    json: false,
    dryRun: false,
    timeZone: defaultTimeZone(),
  };
}

function toOptions(state: ParseState, help: boolean, version: boolean): CollectOptions {
  return {
    command: 'collect',
    dirs: [...state.dirs],
    authors: [...state.authors],
    sinceDayKey: state.sinceDayKey,
    untilDayKey: state.untilDayKey,
    out: state.out,
    repos: [...state.repos],
    excludes: [...state.excludes],
    maxDepth: state.maxDepth,
    summaries: state.summaries,
    timeZone: state.timeZone,
    json: state.json,
    dryRun: state.dryRun,
    help,
    version,
  };
}

function applyFlag(key: FlagKey, state: ParseState): void {
  if (key === 'summaries') state.summaries = false;
  else if (key === 'json') state.json = true;
  else state.dryRun = true;
}

function applyListValue(key: 'authors' | 'repos' | 'excludes', value: string, state: ParseState): void {
  state[key].push(value);
}

function applyScalarValue(
  key: ValueKey,
  name: string,
  value: string,
  state: ParseState,
  errors: string[],
): void {
  switch (key) {
    case 'out':
      state.out = value;
      return;
    case 'timeZone':
      if (!isTimeZone(value)) {
        errors.push(`unknown time zone for ${name}: ${value}`);
        return;
      }
      state.timeZone = value;
      return;
    case 'maxDepth': {
      const depth = Number(value);
      if (!/^\d+$/.test(value) || depth > MAX_DEPTH_LIMIT) {
        errors.push(`${name} expects an integer between 0 and ${MAX_DEPTH_LIMIT}, got: ${value}`);
        return;
      }
      state.maxDepth = depth;
      return;
    }
    case 'sinceDayKey':
    case 'untilDayKey': {
      if (!isDayKey(value)) {
        errors.push(`${name} expects a calendar day as YYYY-MM-DD, got: ${value}`);
        return;
      }
      state[key] = value;
      return;
    }
    default:
      return;
  }
}

function applyValue(
  key: ValueKey,
  name: string,
  value: string,
  state: ParseState,
  errors: string[],
): void {
  if (value.length === 0) {
    errors.push(`missing value for ${name}`);
    return;
  }
  if (key === 'authors' || key === 'repos' || key === 'excludes') {
    applyListValue(key, value, state);
    return;
  }
  applyScalarValue(key, name, value, state, errors);
}

function splitOption(token: string): { name: string; inline: string | null } {
  const equals = token.indexOf('=');
  if (equals === -1) return { name: token, inline: null };
  return { name: token.slice(0, equals), inline: token.slice(equals + 1) };
}

/** Applies one option token and returns how many argv entries it consumed. */
function applyToken(
  token: string,
  next: string | undefined,
  state: ParseState,
  errors: string[],
): number {
  const { name, inline } = splitOption(token);
  const flag = FLAG_OPTIONS[name];
  if (flag !== undefined) {
    if (inline !== null) errors.push(`option ${name} does not take a value`);
    else applyFlag(flag, state);
    return 1;
  }
  const key = VALUE_OPTIONS[name];
  if (key === undefined) {
    errors.push(`unknown option: ${name}`);
    return 1;
  }
  if (inline !== null) {
    applyValue(key, name, inline, state, errors);
    return 1;
  }
  if (next === undefined || next.startsWith('--')) {
    errors.push(`missing value for ${name}`);
    return 1;
  }
  applyValue(key, name, next, state, errors);
  return 2;
}

function finalize(
  command: string | null,
  state: ParseState,
  errors: string[],
): ParseResult<CollectOptions> {
  if (command === null) {
    errors.push(`missing command: expected "${CLI_NAME} collect <dir...>"`);
  } else if (command !== 'collect') {
    errors.push(`unknown command: ${command} (only "collect" exists)`);
  }
  if (state.dirs.length === 0 && state.repos.length === 0) {
    errors.push('nothing to scan: pass at least one directory or --repo <path>');
  }
  if (
    state.sinceDayKey !== null &&
    state.untilDayKey !== null &&
    state.sinceDayKey > state.untilDayKey
  ) {
    errors.push(`--since ${state.sinceDayKey} is after --until ${state.untilDayKey}`);
  }
  if (errors.length > 0) return err(...errors);
  return ok(toOptions(state, false, false));
}

/**
 * Parses `argv` (without the node binary and script path).
 *
 * `--help` and `--version` win over everything else, so `ghost-hours --help`
 * always answers even with a malformed command line; every other problem is
 * reported as a usage error, which the CLI maps to exit code 2.
 */
export function parseArgv(argv: readonly string[]): ParseResult<CollectOptions> {
  const tokens = argv.filter((token) => token.length > 0);
  if (tokens.includes('--help') || tokens.includes('-h')) {
    return ok(toOptions(emptyState(), true, false));
  }
  if (tokens.includes('--version') || tokens.includes('-V')) {
    return ok(toOptions(emptyState(), false, true));
  }
  const state = emptyState();
  const errors: string[] = [];
  let command: string | null = null;
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    if (token.startsWith('-')) {
      index += applyToken(token, tokens[index + 1], state, errors);
      continue;
    }
    if (command === null) command = token;
    else state.dirs.push(token);
    index += 1;
  }
  return finalize(command, state, errors);
}
