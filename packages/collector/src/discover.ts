import { basename, join, resolve, sep } from 'node:path';
import type { FsPort } from './fs-port.ts';

/** Folders never descended into, whatever the caller asks for. */
export const ALWAYS_SKIPPED = ['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo'] as const;

export interface DiscoveredRepo {
  /** Absolute, normalised path of the repository working tree. */
  readonly path: string;
  /** Folder name, used as the `repo` field of every evidence item (D.10). */
  readonly name: string;
}

export interface DiscoverOptions {
  readonly roots: readonly string[];
  readonly maxDepth: number;
  readonly excludes: readonly string[];
}

export interface DiscoverResult {
  readonly repos: readonly DiscoveredRepo[];
  readonly warnings: readonly string[];
}

const GLOB_CACHE = new Map<string, RegExp>();

function isMetaCharacter(char: string): boolean {
  return '\\^$.|+()[]{}'.includes(char);
}

/** Minimal glob support (`*`, `**`, `?`) so the CLI needs no dependency (HEU-N-07). */
export function globToRegExp(pattern: string): RegExp {
  const cached = GLOB_CACHE.get(pattern);
  if (cached !== undefined) return cached;
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern.charAt(index);
    if (char === '*') {
      const isDouble = pattern.charAt(index + 1) === '*';
      const eatsSlash = isDouble && pattern.charAt(index + 2) === '/';
      source += eatsSlash ? '(?:.*/)?' : isDouble ? '.*' : '[^/]*';
      index += eatsSlash ? 3 : isDouble ? 2 : 1;
      continue;
    }
    source += char === '?' ? '[^/]' : isMetaCharacter(char) ? `\\${char}` : char;
    index += 1;
  }
  const compiled = new RegExp(`^${source}$`);
  GLOB_CACHE.set(pattern, compiled);
  return compiled;
}

function toPosix(value: string): string {
  return sep === '/' ? value : value.split(sep).join('/');
}

/** A pattern containing a slash matches a relative path; a bare one matches a folder name. */
export function matchesGlob(pattern: string, relativePath: string, name: string): boolean {
  const cleaned = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
  if (cleaned.length === 0) return false;
  const target = cleaned.includes('/') ? relativePath : name;
  return globToRegExp(cleaned).test(target);
}

function isSkipped(relativePath: string, name: string, excludes: readonly string[]): boolean {
  if ((ALWAYS_SKIPPED as readonly string[]).includes(name)) return true;
  return excludes.some((pattern) => matchesGlob(pattern, relativePath, name));
}

async function isRepository(fs: FsPort, path: string): Promise<boolean> {
  try {
    await fs.stat(join(path, '.git'));
    return true;
  } catch {
    return false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function byName(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface WalkContext {
  readonly fs: FsPort;
  readonly options: DiscoverOptions;
  readonly repos: DiscoveredRepo[];
  readonly warnings: string[];
}

async function walk(context: WalkContext, dir: string, relativePath: string, depth: number): Promise<void> {
  if (await isRepository(context.fs, dir)) {
    context.repos.push({ path: dir, name: basename(dir) });
    return;
  }
  if (depth >= context.options.maxDepth) return;
  let entries;
  try {
    entries = await context.fs.readdir(dir);
  } catch (error) {
    context.warnings.push(`cannot read folder ${dir}: ${describe(error)}`);
    return;
  }
  const subdirs = entries
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) => !isSkipped(relativePath === '' ? name : `${relativePath}/${name}`, name, context.options.excludes))
    .sort(byName);
  for (const name of subdirs) {
    await walk(context, join(dir, name), relativePath === '' ? name : `${relativePath}/${name}`, depth + 1);
  }
}

function dedupeAndSort(repos: readonly DiscoveredRepo[]): DiscoveredRepo[] {
  const seen = new Map<string, DiscoveredRepo>();
  for (const repo of repos) if (!seen.has(repo.path)) seen.set(repo.path, repo);
  return [...seen.values()].sort((left, right) => byName(toPosix(left.path), toPosix(right.path)));
}

/**
 * Finds every Git repository under the given roots.
 *
 * The scan stops at a repository: a repository nested inside another working
 * tree is not reported separately, which keeps the result stable and cheap. The
 * output is sorted by path, so two runs always produce the same evidence file
 * (HEU-F-16, HEU-P-14).
 */
export async function discoverRepos(fs: FsPort, options: DiscoverOptions): Promise<DiscoverResult> {
  const context: WalkContext = { fs, options, repos: [], warnings: [] };
  for (const root of options.roots) {
    await walk(context, resolve(root), '', 0);
  }
  return { repos: dedupeAndSort(context.repos), warnings: context.warnings };
}
