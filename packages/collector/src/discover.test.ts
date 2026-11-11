import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverRepos, globToRegExp, matchesGlob } from './discover.ts';
import { createNodeFs } from './fs-port.ts';
import type { Workspace } from './test-support.ts';
import { createWorkspace } from './test-support.ts';

let workspace: Workspace;

async function makeRepo(...segments: string[]): Promise<string> {
  const path = join(workspace.root, ...segments);
  await mkdir(join(path, '.git'), { recursive: true });
  return path;
}

beforeEach(async () => {
  workspace = await createWorkspace();
});

afterEach(async () => {
  await workspace.dispose();
});

describe('matchesGlob', () => {
  it('matches bare patterns against the folder name', () => {
    expect(matchesGlob('vendor', 'a/vendor', 'vendor')).toBe(true);
    expect(matchesGlob('ven*', 'a/vendor', 'vendor')).toBe(true);
    expect(matchesGlob('ven?or', 'a/vendor', 'vendor')).toBe(true);
    expect(matchesGlob('dist', 'a/vendor', 'vendor')).toBe(false);
  });

  it('matches patterns with a slash against the relative path', () => {
    expect(matchesGlob('clients/*/legacy', 'clients/acme/legacy', 'legacy')).toBe(true);
    expect(matchesGlob('**/legacy', 'clients/acme/legacy', 'legacy')).toBe(true);
    expect(matchesGlob('./clients/legacy', 'clients/legacy', 'legacy')).toBe(true);
    expect(matchesGlob('clients/acme/legacy', 'clients/globex/legacy', 'legacy')).toBe(false);
  });

  it('escapes regular expression metacharacters', () => {
    expect(globToRegExp('a.b').test('axb')).toBe(false);
    expect(globToRegExp('a.b').test('a.b')).toBe(true);
  });
});

describe('discoverRepos', () => {
  it('finds repositories up to the requested depth, sorted by path', async () => {
    const shallow = await makeRepo('work', 'acme-api');
    const deep = await makeRepo('work', 'clients', 'northwind', 'northwind-portal');
    await makeRepo('work', 'too', 'deep', 'nested', 'globex-etl');

    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'work')],
      maxDepth: 3,
      excludes: [],
    });

    expect(result.repos.map((repo) => repo.path)).toEqual([shallow, deep]);
    expect(result.repos.map((repo) => repo.name)).toEqual(['acme-api', 'northwind-portal']);
    expect(result.warnings).toEqual([]);
  });

  it('never descends into node_modules, dist or build', async () => {
    await makeRepo('work', 'node_modules', 'pkg');
    await makeRepo('work', 'dist', 'bundle');
    await makeRepo('work', 'build', 'out');
    await makeRepo('work', 'acme-api');

    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'work')],
      maxDepth: 4,
      excludes: [],
    });

    expect(result.repos.map((repo) => repo.name)).toEqual(['acme-api']);
  });

  it('honours --exclude patterns', async () => {
    await makeRepo('work', 'vendor', 'acme-api');
    await makeRepo('work', 'clients', 'legacy', 'old-portal');
    await makeRepo('work', 'clients', 'northwind-portal');

    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'work')],
      maxDepth: 4,
      excludes: ['vendor', 'clients/legacy'],
    });

    expect(result.repos.map((repo) => repo.name)).toEqual(['northwind-portal']);
  });

});

describe('discoverRepos — edge cases', () => {
  it('stops at a repository instead of reporting nested ones', async () => {
    const outer = await makeRepo('work', 'acme-api');
    await makeRepo('work', 'acme-api', 'packages', 'inner');

    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'work')],
      maxDepth: 4,
      excludes: [],
    });

    expect(result.repos.map((repo) => repo.path)).toEqual([outer]);
  });

  it('returns no repository and a warning for a folder without one', async () => {
    await mkdir(join(workspace.root, 'empty'), { recursive: true });
    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'empty')],
      maxDepth: 4,
      excludes: [],
    });
    expect(result.repos).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports an unreadable folder instead of throwing', async () => {
    const result = await discoverRepos(createNodeFs(), {
      roots: [join(workspace.root, 'does-not-exist')],
      maxDepth: 4,
      excludes: [],
    });
    expect(result.repos).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('cannot read folder');
  });

  it('deduplicates a root given twice', async () => {
    await makeRepo('work', 'acme-api');
    const root = join(workspace.root, 'work');
    const result = await discoverRepos(createNodeFs(), { roots: [root, root], maxDepth: 2, excludes: [] });
    expect(result.repos).toHaveLength(1);
  });
});
