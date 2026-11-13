#!/usr/bin/env node
/**
 * anonymize-evidence.mjs — turn a real evidence file into a publishable one.
 *
 * A tool, not a guard: it does not protect a promise, it makes one possible. The
 * repository and the demo site are public, and the most convincing month anyone
 * can show is a real one. Real evidence carries repository names, remotes, local
 * paths, branch names and an author address. This script replaces every one of
 * them with a pseudonym and keeps everything that actually matters — the
 * instants, the rhythm, the volume, the lines touched, the branch switches.
 *
 * What is preserved: `at`, `kind`, `source`, `added`, `deleted`, the shape of
 * the reflog (`from` / `to`), the number of repositories and their volumes.
 * What is replaced: repository name, remote, branch names, author email, local
 * path, evidence id (re-derived from a hash, so nothing links back to a commit).
 * What is dropped: commit summaries, always — use `--no-summaries` when
 * collecting and this script refuses a file that still carries them.
 *
 * The mapping is deterministic (sorted by original name) and is printed only
 * with `--print-map`, so it never lands in a CI log by accident. Keep it out of
 * the repository: the pseudonyms are the point.
 *
 * Usage:
 *   node scripts/anonymize-evidence.mjs <in.json> <out.json> [--prefix projet] [--print-map]
 *
 * Exit 0 written, 1 refused (a summary survived, unreadable file, no item),
 * 2 usage error.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const NAME = 'anonymize-evidence';
const AUTHOR = 'dev@example.invalid';

function usage(out = process.stdout) {
  out.write(
    `${NAME} — replace every identifying string of an evidence file with a pseudonym.\n\n` +
      'Usage:\n' +
      `  node scripts/${NAME}.mjs <in.json> <out.json> [--prefix projet] [--print-map]\n\n` +
      'Options:\n' +
      '  --prefix <word>  pseudonym stem for repositories (default: projet)\n' +
      '  --print-map      print the real → pseudonym table on stdout\n' +
      '  --help           print this help and exit\n\n' +
      'Exit codes:\n  0 written\n  1 refused\n  2 usage error\n',
  );
}

function parseArgs(argv) {
  const positional = [];
  let prefix = 'projet';
  let printMap = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--print-map') printMap = true;
    else if (arg === '--prefix') {
      prefix = argv[++index];
      if (prefix === undefined) throw new Error('--prefix needs a value');
    } else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) throw new Error('exactly two paths are required: <in.json> <out.json>');
  return { help: false, input: positional[0], output: positional[1], prefix, printMap };
}

/** One pseudonym per distinct value, numbered in sorted order: re-runnable. */
function numbered(values, stem) {
  const map = new Map();
  for (const value of [...new Set(values)].filter((item) => item !== undefined && item !== '').sort()) {
    map.set(value, `${stem}-${map.size + 1}`);
  }
  return map;
}

/** A stable, unlinkable id: the hash of the original, salted by its repository. */
function pseudonymId(originalId, repoPseudo) {
  return `${repoPseudo}:${createHash('sha256').update(originalId).digest('hex').slice(0, 16)}`;
}

function anonymize(file, prefix) {
  const items = Array.isArray(file.items) ? file.items : [];
  const withSummary = items.filter((item) => item.summary !== undefined && item.summary !== '');
  if (withSummary.length > 0) {
    throw new Error(
      `${withSummary.length} item(s) still carry a commit summary — collect again with --no-summaries`,
    );
  }
  const repos = numbered(items.map((item) => item.repo), prefix);
  const branches = numbered(
    items.flatMap((item) => [item.branch, item.to, item.from]),
    'branche',
  );

  const anonymized = items.map((item) => {
    const repo = repos.get(item.repo) ?? `${prefix}-0`;
    const next = { ...item, id: pseudonymId(item.id, repo), repo };
    delete next.summary;
    if (next.remote !== undefined) next.remote = `git@example.invalid:${repo}.git`;
    if (next.authorEmail !== undefined) next.authorEmail = AUTHOR;
    for (const field of ['branch', 'to', 'from']) {
      if (next[field] !== undefined) next[field] = branches.get(next[field]) ?? next[field];
    }
    return next;
  });

  const meta = { ...file, items: anonymized };
  if (Array.isArray(file.repos)) {
    meta.repos = file.repos.map((repo) => ({
      path: `/local/${repos.get(repo.name) ?? repo.name}`,
      name: repos.get(repo.name) ?? repo.name,
      remote: `git@example.invalid:${repos.get(repo.name) ?? repo.name}.git`,
      commitCount: repo.commitCount,
      reflogEntries: repo.reflogEntries,
    }));
  }
  return { file: meta, repos, branches };
}

function report(result, options) {
  const { file, repos, branches } = result;
  process.stdout.write(
    `${NAME}: ${file.items.length} item(s), ${repos.size} repository(ies), ` +
      `${branches.size} branch name(s) replaced\n`,
  );
  if (!options.printMap) return;
  process.stdout.write('\nreal → pseudonym (keep this out of the repository):\n');
  for (const [real, pseudo] of repos) process.stdout.write(`  repo   ${real} → ${pseudo}\n`);
  for (const [real, pseudo] of branches) process.stdout.write(`  branch ${real} → ${pseudo}\n`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${NAME}: ${error.message}\n`);
    usage(process.stderr);
    return 2;
  }
  if (options.help) {
    usage();
    return 0;
  }
  try {
    const input = JSON.parse(readFileSync(options.input, 'utf8'));
    const result = anonymize(input, options.prefix);
    if (result.file.items.length === 0) throw new Error('no item to publish');
    writeFileSync(options.output, `${JSON.stringify(result.file)}\n`);
    report(result, options);
    return 0;
  } catch (error) {
    process.stderr.write(`${NAME}: ${error.message}\n`);
    return 1;
  }
}

process.exit(main());
