#!/usr/bin/env node
/**
 * demo.mjs — the whole demonstration, relaunched with one command.
 *
 * The demo has four parts that must never drift apart: the real month's
 * figures, the anchor that freezes them, the tests that recompute them, and the
 * static site that shows them. This script runs them in order and stops at the
 * first thing that breaks, so "the demo" is a command, not a memory.
 *
 *   node scripts/demo.mjs                # the whole chain
 *   node scripts/demo.mjs --from anchor  # resume from one step
 *   node scripts/demo.mjs --help
 *
 * Steps, in order:
 *   fixture  regenerate fixtures/real-month/expected.json from the evidence
 *   anchor   hash the day's proofs into a chained ledger, then verify it
 *   check    unit tests + typecheck + lint
 *   build    the static site
 *   record   (documented, not run: it needs the video rig and a display — see
 *            docs/DEMO.md or `~/Bureau/ghost-hours-video/record-real.mjs`)
 *
 * Collecting a *different* month is upstream of this script and is described in
 * docs/DEMO.md; the fixture ships already collected and anonymized, so a fresh
 * machine does not need the author's repositories.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname;
const STEPS = ['fixture', 'anchor', 'check', 'build'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: REPO, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stepFixture() {
  process.stdout.write('\n[1/4] fixture — the real month, recomputed\n');
  run('node', ['fixtures/real-month/regenerate.mjs']);
}

function stepAnchor() {
  process.stdout.write('\n[2/4] anchor — the proofs, frozen and verified\n');
  const anchors = join(tmpdir(), 'ghost-hours-demo-anchors.jsonl');
  if (existsSync(anchors)) rmSync(anchors);
  run('node', ['scripts/anchor-evidence.mjs', 'add', 'fixtures/real-month/evidence.json', anchors]);
  run('node', ['scripts/anchor-evidence.mjs', 'verify', 'fixtures/real-month/evidence.json', anchors]);
}

function stepCheck() {
  process.stdout.write('\n[3/4] check — tests, types, lint\n');
  run('pnpm', ['test']);
  run('pnpm', ['typecheck']);
  run('pnpm', ['lint']);
}

function stepBuild() {
  process.stdout.write('\n[4/4] build — the static site\n');
  run('pnpm', ['build']);
}

function printRecord() {
  process.stdout.write(
    '\nTo record the video, on a machine with a display and ffmpeg:\n' +
      '  node ~/Bureau/ghost-hours-video/record-real.mjs https://tradoooo.github.io/ghost-hours/\n',
  );
}

function printUsage() {
  process.stdout.write(
    'demo.mjs — relaunch the whole demonstration.\n\n' +
      'Usage:\n' +
      `  node scripts/demo.mjs [--from <step>]\n\n` +
      `Steps: ${STEPS.join(', ')} (record is documented, not run).\n`,
  );
}

function main(argv) {
  let from = 'fixture';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--help' || argv[index] === '-h') {
      printUsage();
      return 0;
    }
    if (argv[index] === '--from') {
      from = argv[++index];
      continue;
    }
    process.stderr.write(`demo: unknown argument ${argv[index]}\n`);
    printUsage();
    return 2;
  }
  const startIndex = STEPS.indexOf(from);
  if (startIndex === -1) {
    process.stderr.write(`demo: unknown step "${from}"\n`);
    return 2;
  }
  const runners = [stepFixture, stepAnchor, stepCheck, stepBuild];
  for (let index = startIndex; index < runners.length; index += 1) runners[index]();
  printRecord();
  process.stdout.write('\ndemo: every step succeeded\n');
  return 0;
}

process.exit(main(process.argv.slice(2)));