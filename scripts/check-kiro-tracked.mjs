#!/usr/bin/env node
/**
 * check-kiro-tracked.mjs — the contest folder is present, tracked and licensed.
 *
 * Kiroween 2026 requires, in the public repository:
 *   - a `/.kiro` directory at the root,
 *   - no `.gitignore` line that ignores it,
 *   - a licence file at the root (MIT for this project).
 *
 * Run in CI as a normal guard, and by the `kiro-folder-guard` Kiro hook before a write. In that
 * second use, `--block` turns a finding into exit code 2, which the hook reads as "refuse this
 * tool call" — that is how a stray `.kiro/` line in `.gitignore` is stopped before it lands.
 *
 * Only the three contest requirements fail the run. Everything else (a missing `skills/`, an empty
 * `agents/`) is printed as a note, because this guard also runs while the folder is being built.
 *
 * Exit 0 clean, 1 findings (2 with `--block`), 2 usage error.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { Reporter, main, parseArgs, printUsage, wantsHelp } from './lib/report.mjs';

const NAME = 'check-kiro-tracked';

/** Patterns in `.gitignore` that would hide the root `.kiro` directory. */
const IGNORING_PATTERNS = new Set([
  '.kiro',
  '.kiro/',
  '/.kiro',
  '/.kiro/',
  '.kiro/**',
  '.kiro/*',
  '**/.kiro',
  '**/.kiro/**',
  '**/.kiro/*',
  '.*',
  '/.*',
  '*',
  '**',
  '**/*',
]);

/** Sub-folders the contest submission expects; missing ones are a note, not a failure. */
const EXPECTED = ['steering', 'specs', 'hooks', 'agents', 'skills'];

const USAGE = {
  name: `${NAME} — contest folder guard`,
  summary:
    'Check that .kiro exists at the root, is not ignored by .gitignore, and that LICENSE exists.',
  usage: 'node scripts/check-kiro-tracked.mjs [--root <dir>] [--block] [--help]',
  options: [
    ['--root <dir>', 'repository root (default: current directory)'],
    ['--block', 'exit 2 instead of 1 on findings (Kiro PreToolUse refusal)'],
    ['--help', 'print this help'],
  ],
  exits: [
    ['0', 'clean'],
    ['1', 'findings'],
    ['2', 'usage error, or findings when --block is set'],
  ],
};

/** Normalise a `.gitignore` line, or return null when it is blank, a comment or a negation. */
export function normalizeIgnoreLine(line) {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return null;
  return trimmed.replace(/\/+$/, '');
}

/** True when `line` (a raw `.gitignore` line) would ignore the root `.kiro` directory. */
export function ignoresKiro(line) {
  const pattern = normalizeIgnoreLine(line);
  if (pattern === null) return false;
  if (IGNORING_PATTERNS.has(pattern)) return true;
  return pattern.endsWith('/.kiro');
}

/** True when the repository is a git work tree we can ask about ignore rules. */
function isGitWorkTree(root) {
  return existsSync(join(root, '.git'));
}

/** Ask git itself whether `.kiro` is ignored; null when git cannot answer. */
function gitSaysIgnored(root) {
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '--quiet', '.kiro'], { stdio: 'ignore' });
    return true; // exit 0 means "yes, ignored"
  } catch (error) {
    return error?.status === 1 ? false : null;
  }
}

function run(argv) {
  if (wantsHelp(argv)) return printUsage(USAGE);

  const parsed = parseArgs(argv, { booleans: ['block'], values: ['root'] });
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  const root = typeof parsed.flags.root === 'string' ? parsed.flags.root : process.cwd();
  const block = parsed.flags.block === true;

  const reporter = new Reporter(NAME);
  const notes = [];

  // 1. .kiro exists and is a directory.
  const kiroDir = join(root, '.kiro');
  const kiroExists = existsSync(kiroDir) && statSync(kiroDir).isDirectory();
  if (!kiroExists) {
    reporter.add('.kiro', 0, 'missing: the contest requires a .kiro directory at the root');
  } else {
    for (const folder of EXPECTED) {
      if (!existsSync(join(kiroDir, folder))) notes.push(`.kiro/${folder}/ does not exist yet`);
    }
  }

  // 2. .gitignore does not hide it.
  const ignorePath = join(root, '.gitignore');
  if (!existsSync(ignorePath)) {
    notes.push('.gitignore does not exist (nothing can ignore .kiro)');
  } else {
    const lines = readFileSync(ignorePath, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (ignoresKiro(lines[index])) {
        reporter.add('.gitignore', index + 1, 'this line would make git ignore .kiro');
      }
    }
    if (isGitWorkTree(root)) {
      const ignored = gitSaysIgnored(root);
      if (ignored === true) reporter.add('.kiro', 0, 'git reports .kiro as ignored (check-ignore)');
    }
  }

  // 3. A licence file at the root.
  const licensePath = ['LICENSE', 'LICENSE.md', 'LICENSE.txt']
    .map((name) => join(root, name))
    .find((candidate) => existsSync(candidate));
  if (licensePath === undefined) {
    reporter.add('LICENSE', 0, 'missing: the contest requires a licence file at the root');
  } else if (!/\bMIT\b/.test(readFileSync(licensePath, 'utf8'))) {
    notes.push(`${licensePath.slice(root.length + 1)} exists but does not mention MIT`);
  }

  const code = reporter.finish({ what: 'checks' });
  for (const note of notes) process.stdout.write(`note: ${note}\n`);

  if (code === 1 && block) {
    process.stdout.write('refused: fix the finding above before writing.\n');
    return 2;
  }
  return code;
}

process.exitCode = main(NAME, () => run(process.argv.slice(2)));
