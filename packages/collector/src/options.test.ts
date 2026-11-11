import { describe, expect, it } from 'vitest';
import {
  CLI_NAME,
  DEFAULT_MAX_DEPTH,
  DEFAULT_OUT,
  defaultTimeZone,
  HELP_TEXT,
  isDayKey,
  isTimeZone,
  parseArgv,
} from './options.ts';
import type { CollectOptions } from './options.ts';

function parse(argv: readonly string[]): CollectOptions {
  const result = parseArgv(argv);
  if (!result.ok) throw new Error(`expected success, got: ${result.errors.join('; ')}`);
  return result.value;
}

function parseErrors(argv: readonly string[]): readonly string[] {
  const result = parseArgv(argv);
  if (result.ok) throw new Error('expected a usage error');
  return result.errors;
}

describe('parseArgv — defaults', () => {
  it('applies the documented defaults', () => {
    const options = parse(['collect', '/tmp/code']);
    expect(options.command).toBe('collect');
    expect(options.dirs).toEqual(['/tmp/code']);
    expect(options.authors).toEqual([]);
    expect(options.sinceDayKey).toBeNull();
    expect(options.untilDayKey).toBeNull();
    expect(options.out).toBe(DEFAULT_OUT);
    expect(options.repos).toEqual([]);
    expect(options.excludes).toEqual([]);
    expect(options.maxDepth).toBe(DEFAULT_MAX_DEPTH);
    expect(options.summaries).toBe(true);
    expect(options.json).toBe(false);
    expect(options.dryRun).toBe(false);
    expect(options.timeZone).toBe(defaultTimeZone());
    expect(options.help).toBe(false);
    expect(options.version).toBe(false);
  });

});

describe('parseArgv — values', () => {
  it('accepts several folders and repeats every repeatable option', () => {
    const options = parse([
      'collect',
      '/tmp/a',
      '/tmp/b',
      '--author',
      'sofia@example.com',
      '--author=Malik',
      '--exclude',
      'vendor',
      '--exclude=**/legacy',
      '--repo',
      '/tmp/repo-one',
      '--repo=/tmp/repo-two',
    ]);
    expect(options.dirs).toEqual(['/tmp/a', '/tmp/b']);
    expect(options.authors).toEqual(['sofia@example.com', 'Malik']);
    expect(options.excludes).toEqual(['vendor', '**/legacy']);
    expect(options.repos).toEqual(['/tmp/repo-one', '/tmp/repo-two']);
  });

  it('reads every scalar option', () => {
    const options = parse([
      'collect',
      '.',
      '--since',
      '2026-11-01',
      '--until=2026-11-30',
      '--out',
      'out/evidence.json',
      '--max-depth',
      '2',
      '--timezone',
      'Europe/Paris',
    ]);
    expect(options.sinceDayKey).toBe('2026-11-01');
    expect(options.untilDayKey).toBe('2026-11-30');
    expect(options.out).toBe('out/evidence.json');
    expect(options.maxDepth).toBe(2);
    expect(options.timeZone).toBe('Europe/Paris');
  });

});

describe('parseArgv — switches', () => {
  it('turns on the switches', () => {
    const options = parse(['collect', '.', '--no-summaries', '--json', '--dry-run']);
    expect(options.summaries).toBe(false);
    expect(options.json).toBe(true);
    expect(options.dryRun).toBe(true);
  });

  it('accepts --repo without a folder', () => {
    const options = parse(['collect', '--repo', '/tmp/only-one']);
    expect(options.dirs).toEqual([]);
    expect(options.repos).toEqual(['/tmp/only-one']);
  });

});

describe('parseArgv — help and version', () => {
  it('wins for --help and --version, whatever the rest', () => {
    expect(parse(['collect', '--help']).help).toBe(true);
    expect(parse(['--help']).help).toBe(true);
    expect(parse(['--nonsense', '-h']).help).toBe(true);
    expect(parse(['--version']).version).toBe(true);
    expect(parse(['collect', '.', '-V']).version).toBe(true);
    expect(HELP_TEXT).toContain(CLI_NAME);
    expect(HELP_TEXT).toContain('--no-summaries');
    expect(HELP_TEXT).toContain('Exit codes');
  });
});

describe('parseArgv — usage errors', () => {
  it('reports usage errors that the CLI maps to exit code 2', () => {
    expect(parseErrors([]).join(' ')).toContain('missing command');
    expect(parseErrors(['scan', '.']).join(' ')).toContain('unknown command');
    expect(parseErrors(['collect']).join(' ')).toContain('nothing to scan');
    expect(parseErrors(['collect', '.', '--nope']).join(' ')).toContain('unknown option: --nope');
    expect(parseErrors(['collect', '.', '--author']).join(' ')).toContain('missing value for --author');
    expect(parseErrors(['collect', '.', '--since', '11/2026']).join(' ')).toContain('YYYY-MM-DD');
    expect(parseErrors(['collect', '.', '--until', '2026-02-30']).join(' ')).toContain('YYYY-MM-DD');
    expect(parseErrors(['collect', '.', '--max-depth', 'deep']).join(' ')).toContain('integer');
    expect(parseErrors(['collect', '.', '--max-depth', '-1']).join(' ')).toContain('integer');
    expect(parseErrors(['collect', '.', '--timezone', 'Mars/Olympus']).join(' ')).toContain('unknown time zone');
    expect(parseErrors(['collect', '.', '--json=yes']).join(' ')).toContain('does not take a value');
    expect(parseErrors(['collect', '.', '--since', '2026-11-30', '--until', '2026-11-01']).join(' ')).toContain(
      'is after --until',
    );
  });

  it('validates day keys and time zones', () => {
    expect(isDayKey('2026-11-01')).toBe(true);
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('20261101')).toBe(false);
    expect(isTimeZone('Europe/Paris')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Nowhere/Land')).toBe(false);
  });
});
