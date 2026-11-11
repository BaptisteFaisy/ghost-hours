import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from './cli.ts';
import { formatReport } from './cli.ts';
import type { Fixture } from './test-support.ts';
import { createAcmeFixture, createRepo, createWorkspace, readJson } from './test-support.ts';

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const deps = { now: () => NOW };

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

let fixture: Fixture;
let out: string;

async function run(argv: readonly string[]): Promise<Captured> {
  const chunks: string[] = [];
  const errors: string[] = [];
  const code = await main(argv, { out: (text) => chunks.push(text), err: (text) => errors.push(text) }, deps);
  return { code, stdout: chunks.join(''), stderr: errors.join('') };
}

beforeEach(async () => {
  fixture = await createAcmeFixture();
  out = join(fixture.workspace.root, 'out', 'evidence.json');
});

afterEach(async () => {
  await fixture.workspace.dispose();
});

describe('main', () => {
  it('answers --help and --version with exit code 0', async () => {
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Usage:');
    expect(help.stdout).toContain('ghost-hours collect <dir...>');

    const version = await run(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^ghost-hours \d+\.\d+\.\d+\n$/);
  });

  it('returns exit code 2 on a usage error', async () => {
    for (const argv of [[], ['collect'], ['collect', '.', '--bogus'], ['collect', '.', '--since', 'nope']]) {
      const result = await run(argv);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('ghost-hours:');
      expect(result.stderr).toContain('--help');
    }
  });

});

describe('main — collect', () => {
  it('collects and prints a readable report', async () => {
    const result = await run(['collect', fixture.repoPath, '--out', out, '--timezone', 'Europe/Paris']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('acme-api');
    expect(result.stdout).toContain('evidence: 7 item(s)');
    expect(result.stdout).toContain(`wrote ${out}`);
    expect(result.stderr).toBe('');
  });

  it('writes the file when asked, and the report describes it', async () => {
    const result = await run(['collect', fixture.repoPath, '--out', out]);
    expect(result.code).toBe(0);
    const file = await readJson(out);
    expect(file.items).toHaveLength(7);
  });

  it('prints the evidence file on stdout with --json', async () => {
    const result = await run(['collect', fixture.repoPath, '--out', out, '--json']);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { version: number; items: unknown[] };
    expect(parsed.version).toBe(1);
    expect(parsed.items).toHaveLength(7);
  });

  it('writes nothing and lists the repositories with --dry-run', async () => {
    const result = await run(['collect', fixture.workspace.root, '--out', out, '--dry-run']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dry run: nothing written');
    expect(result.stdout).toContain('evidence: 7 item(s)');
    await expect(readJson(out)).rejects.toThrow();
  });

});

describe('main — failures', () => {
  it('reports a path that is not a repository instead of throwing', async () => {
    const plain = join(fixture.workspace.root, 'plain-folder');
    await mkdir(plain, { recursive: true });
    const result = await run(['collect', '--repo', plain, '--out', out]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('ERROR');
    expect(result.stdout).toContain('not a git repository');
    expect(result.stdout).toContain('not written');
    await expect(readJson(out)).rejects.toThrow();
  });

  it('reports a missing repository path instead of throwing', async () => {
    const result = await run(['collect', '--repo', join(fixture.workspace.root, 'gone'), '--out', out]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('ERROR');
  });

  it('reports an empty repository without failing', async () => {
    const empty = await createRepo(fixture.workspace, { name: 'empty-repo', commits: [] });
    const result = await run(['collect', '--repo', empty, '--out', out]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('empty-repo');
    expect(result.stdout).toContain('evidence: 0 item(s)');
  });

  it('says so when a folder holds no repository', async () => {
    const bare = await createWorkspace();
    try {
      const result = await run(['collect', bare.root, '--out', out]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('warning: no Git repository found under');
      expect(result.stdout).toContain('evidence: 0 item(s)');
    } finally {
      await bare.dispose();
    }
  });

  it('returns exit code 1 when the evidence file cannot be written', async () => {
    const target = join(fixture.workspace.root, 'out-as-folder');
    await mkdir(target, { recursive: true });
    const result = await run(['collect', fixture.repoPath, '--out', target]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('collection failed');
  });

});

describe('formatReport', () => {
  it('formats a report without a trailing blank line', () => {
    const text = formatReport({
      timeZone: 'Europe/Paris',
      repos: [],
      itemCount: 0,
      commitCount: 0,
      checkoutCount: 0,
      out: null,
      wrote: false,
      dryRun: true,
      warnings: [],
      fileText: '',
    });
    expect(text.endsWith('dry run: nothing written\n')).toBe(true);
  });
});
