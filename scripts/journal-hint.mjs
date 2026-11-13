#!/usr/bin/env node
/**
 * journal-hint.mjs — remind the author to write the journal, without blocking anything.
 *
 * `KIRO_JOURNAL.md` is a submission requirement: the Devpost form asks eight precise questions and
 * the journal is where the answers are collected as the work happens. It is easy to forget after a
 * long spec run, so the `Stop` hook calls this script: if a spec file is newer than the journal,
 * print one short reminder.
 *
 * Non-blocking by design: exit 0 whether or not there is something to say, because a reminder that
 * fails a session is a reminder that gets removed. `--strict` exits 1 instead, for a CI job that
 * wants to enforce it.
 *
 * Comparison is on modification times, which is what "touched" means here; the tree is not
 * required to be a git repository.
 *
 * Exit 0 always (1 with --strict when the journal is behind), 2 usage error.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { dim, green, main, parseArgs, printUsage, wantsHelp } from './lib/report.mjs';

const NAME = 'journal-hint';

const USAGE = {
  name: `${NAME} — KIRO_JOURNAL.md reminder`,
  summary:
    'Print a short reminder when a .kiro/specs/**/tasks.md file is newer than KIRO_JOURNAL.md.',
  usage: 'node scripts/journal-hint.mjs [--root <dir>] [--strict] [--help]',
  options: [
    ['--root <dir>', 'repository root (default: current directory)'],
    ['--strict', 'exit 1 when the journal is behind (default: always exit 0)'],
    ['--help', 'print this help'],
  ],
  exits: [
    ['0', 'nothing to report, or a reminder was printed'],
    ['1', 'the journal is behind (only with --strict)'],
    ['2', 'usage error'],
  ],
};

/** Recursively collect `*.md` files under `.kiro/specs`, with their mtime. */
function specFiles(root) {
  const base = join(root, '.kiro', 'specs');
  if (!existsSync(base)) return [];
  const found = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      found.push({ path: relative(root, abs), mtime: statSync(abs).mtimeMs });
    }
  };

  walk(base);
  return found.sort((a, b) => b.mtime - a.mtime);
}

function formatTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
}

function run(argv) {
  if (wantsHelp(argv)) return printUsage(USAGE);

  const parsed = parseArgs(argv, { booleans: ['strict'], values: ['root'] });
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  const root = typeof parsed.flags.root === 'string' ? parsed.flags.root : process.cwd();
  const strict = parsed.flags.strict === true;

  const specs = specFiles(root);
  if (specs.length === 0) {
    process.stdout.write(`${dim('no spec file yet: nothing to journal')}\n`);
    return 0;
  }

  const journalPath = join(root, 'KIRO_JOURNAL.md');
  const journalMtime = existsSync(journalPath) ? statSync(journalPath).mtimeMs : 0;
  const newest = specs[0];

  if (journalMtime >= newest.mtime) {
    process.stdout.write(`${green('OK')}   ${NAME} — KIRO_JOURNAL.md is up to date\n`);
    return 0;
  }

  const tasks = specs.filter((file) => file.path.endsWith('tasks.md') && file.mtime > journalMtime);
  process.stdout.write(
    [
      `${NAME}: KIRO_JOURNAL.md is older than the spec work`,
      `  newest spec file : ${newest.path} (${formatTime(newest.mtime)})`,
      `  KIRO_JOURNAL.md  : ${journalMtime === 0 ? 'missing' : formatTime(journalMtime)}`,
      tasks.length > 0 ? `  tasks touched    : ${tasks.length} file(s), e.g. ${tasks[0].path}` : '',
      '  add one line: surface used, decision taken, evidence produced.',
    ]
      .filter((line) => line !== '')
      .join('\n')
      .concat('\n'),
  );
  return strict ? 1 : 0;
}

process.exitCode = main(NAME, () => run(process.argv.slice(2)));
