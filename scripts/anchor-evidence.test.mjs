// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The anchor is the layer that catches backdating, so it is tested against a
 * real falsification: the proofs of one day are moved to another, and the
 * ledger must notice.
 */

const SCRIPT = new URL('./anchor-evidence.mjs', import.meta.url).pathname;

function run(args, cwd) {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function evidenceFile() {
  const items = [
    { id: 'a', at: '2026-10-03T09:00:00.000Z', repo: 'r' },
    { id: 'b', at: '2026-10-03T17:00:00.000Z', repo: 'r' },
    { id: 'c', at: '2026-10-25T10:00:00.000Z', repo: 'r' },
  ];
  return { version: 1, collected_at: '2026-10-26T00:00:00.000Z', timeZone: 'Europe/Paris', items };
}

describe('anchor-evidence', () => {
  it('anchors the days, verifies them, and catches a day moved to another', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-anchor-'));
    const evidence = join(dir, 'evidence.json');
    const anchors = join(dir, 'anchors.jsonl');
    writeFileSync(evidence, JSON.stringify(evidenceFile()));

    const added = run(['add', evidence, anchors], dir);
    expect(added.code).toBe(0);
    expect(added.out).toContain('2 day(s) anchored');

    const verified = run(['verify', evidence, anchors], dir);
    expect(verified.code).toBe(0);
    expect(verified.out).toContain('the chain holds');

    // The falsification: the 25th of October is moved back to the 3rd.
    const falsified = evidenceFile();
    falsified.items[2].at = '2026-10-03T10:00:00.000Z';
    writeFileSync(evidence, JSON.stringify(falsified));

    const caught = run(['verify', evidence, anchors], dir);
    expect(caught.code).toBe(1);
    expect(caught.out).toContain('changed after they were anchored');

    // The tip is the single value worth publishing.
    const tip = run(['tip', anchors], dir);
    expect(tip.code).toBe(0);
    expect(tip.out.trim()).toMatch(/^[0-9a-f]{64}$/);

    // A ledger line removed by hand breaks the chain.
    const lines = readFileSync(anchors, 'utf8').split('\n').filter(Boolean);
    writeFileSync(anchors, `${lines[1]}\n`);
    const broken = run(['verify', evidence, anchors], dir);
    expect(broken.code).toBe(1);
  });

  it('refuses a usage it does not know', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-anchor-'));
    const bad = run(['nope'], dir);
    expect(bad.code).toBe(2);
  });
});
