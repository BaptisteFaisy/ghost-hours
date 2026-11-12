#!/usr/bin/env node
/**
 * anchor-evidence.mjs — the day's proofs, hashed and chained.
 *
 * The weak point of every self-hosted tracker is backdating: on the 30th, invent
 * the 3rd. Signatures do not stop that — Git signs contents, not moments. What
 * stops it is a digest that existed *on the 3rd*: if the proofs of that day
 * change afterwards, the digest no longer matches, and the mismatch is the
 * proof.
 *
 * This script keeps that ledger. It is a file, not a server: `anchors.jsonl`
 * holds one line per day, each chained to the previous one, so removing or
 * editing a line breaks the chain. Publishing the file (to a client's server,
 * to a public repository, to a timestamping service) is what puts the witness
 * outside this machine; the format does not care where.
 *
 *   node scripts/anchor-evidence.mjs add   <evidence.json> <anchors.jsonl>
 *   node scripts/anchor-evidence.mjs verify <evidence.json> <anchors.jsonl>
 *   node scripts/anchor-evidence.mjs tip    <anchors.jsonl>
 *
 * Exit 0 clean, 1 mismatch or refusal, 2 usage error. Standard library only, no
 * network: the ledger is a file, like every other guard in this repository.
 */

import { createHash } from 'node:crypto';
import process from 'node:process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const NAME = 'anchor-evidence';

/** Canonical JSON: the same proof always hashes the same way. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The day an item belongs to, in the zone the file was collected in. */
function dayKeyOf(item, timeZone) {
  const instant = item.at ?? item.start;
  if (instant === undefined) return null;
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The proofs of one day, hashed in a way that does not depend on their order. */
function dayDigest(items) {
  const canonicalItems = items.map(canonical).sort();
  return sha256(canonicalItems.join('\n'));
}

function groupByDay(file) {
  const timeZone = file.timeZone ?? 'UTC';
  const days = new Map();
  for (const item of file.items ?? []) {
    const day = dayKeyOf(item, timeZone);
    if (day === null) continue;
    const list = days.get(day);
    if (list === undefined) days.set(day, [item]);
    else list.push(item);
  }
  return days;
}

function readAnchors(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** The chain: each line hashes the previous one, so a removal breaks it. */
function chainOf(previousChain, dayHash) {
  return sha256(`${previousChain}|${dayHash}`);
}

function add(file, anchorsPath) {
  const collected = JSON.parse(readFileSync(file, 'utf8'));
  const anchors = readAnchors(anchorsPath);
  const lastChain = anchors.length === 0 ? 'genesis' : anchors[anchors.length - 1].chain;
  const days = groupByDay(collected);
  const known = new Map(anchors.map((anchor) => [anchor.day, anchor.hash]));
  let appended = 0;
  let changed = 0;
  let chain = lastChain;
  for (const day of [...days.keys()].sort()) {
    const hash = dayDigest(days.get(day));
    const previousHash = known.get(day);
    if (previousHash === hash) continue;
    if (previousHash !== undefined) changed += 1;
    chain = chainOf(chain, hash);
    const line = {
      day,
      hash,
      chain,
      at: new Date().toISOString(),
      items: days.get(day).length,
    };
    appendFileSync(anchorsPath, `${JSON.stringify(line)}\n`);
    appended += 1;
  }
  process.stdout.write(`${NAME}: ${appended} day(s) anchored, ${changed} changed since the last anchor\n`);
  if (changed > 0) {
    process.stdout.write(
      `${NAME}: a day changed after it was anchored — that is what a backdated commit looks like\n`,
    );
  }
  process.stdout.write(`${NAME}: publish ${anchorsPath} somewhere you do not control\n`);
  return 0;
}

function verify(file, anchorsPath) {
  const collected = JSON.parse(readFileSync(file, 'utf8'));
  const anchors = readAnchors(anchorsPath);
  if (anchors.length === 0) {
    process.stdout.write(`${NAME}: nothing anchored yet\n`);
    return 0;
  }
  const days = groupByDay(collected);
  const problems = [];
  let chain = 'genesis';
  for (const anchor of anchors) {
    const items = days.get(anchor.day);
    if (items === undefined) {
      problems.push(`${anchor.day}: the evidence holds no proof for that day anymore`);
    } else {
      const hash = dayDigest(items);
      if (hash !== anchor.hash) {
        problems.push(`${anchor.day}: the proofs changed after they were anchored`);
      }
    }
    const expected = chainOf(chain, anchor.hash);
    if (expected !== anchor.chain) problems.push(`${anchor.day}: the chain is broken here`);
    chain = anchor.chain;
  }
  if (problems.length === 0) {
    process.stdout.write(`${NAME}: ${anchors.length} day(s) verified, the chain holds\n`);
    return 0;
  }
  for (const problem of problems) process.stderr.write(`${NAME}: ${problem}\n`);
  process.stderr.write(`${NAME}: the ledger does not match the evidence\n`);
  return 1;
}

function tip(anchorsPath) {
  const anchors = readAnchors(anchorsPath);
  if (anchors.length === 0) {
    process.stderr.write(`${NAME}: nothing anchored yet\n`);
    return 1;
  }
  process.stdout.write(`${anchors[anchors.length - 1].chain}\n`);
  return 0;
}

function usage(out = process.stdout) {
  out.write(
    `${NAME} — hash the day's proofs and chain them, day by day.\n\n` +
      'Usage:\n' +
      `  node scripts/${NAME}.mjs add   <evidence.json> <anchors.jsonl>\n` +
      `  node scripts/${NAME}.mjs verify <evidence.json> <anchors.jsonl>\n` +
      `  node scripts/${NAME}.mjs tip    <anchors.jsonl>\n\n` +
      'Exit codes:\n  0 clean\n  1 mismatch or refusal\n  2 usage error\n',
  );
}

function main(argv) {
  const [command, ...paths] = argv;
  if (command === '--help' || command === '-h') {
    usage();
    return 0;
  }
  if (command === 'add' && paths.length === 2) return add(paths[0], paths[1]);
  if (command === 'verify' && paths.length === 2) return verify(paths[0], paths[1]);
  if (command === 'tip' && paths.length === 1) return tip(paths[0]);
  usage(process.stderr);
  return 2;
}

process.exit(main(process.argv.slice(2)));
