/**
 * Shared filesystem helpers for the guards in `scripts/`.
 *
 * Node >= 22, standard library only, no network, no dependency.
 * Everything here is synchronous on purpose: the guards run on save and in CI and must be
 * predictable and fast on a small tree.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Directories never walked: build output, dependencies, VCS metadata. */
export const DEFAULT_IGNORED_DIRS = Object.freeze([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.vite',
  'dev-dist',
  '.pnpm-store',
]);

/** Files never scanned: generated, and full of registry URLs that are not client data. */
export const DEFAULT_IGNORED_FILES = Object.freeze(['pnpm-lock.yaml']);

/** Extensions considered text. Anything else is skipped without being read. */
export const TEXT_EXTENSIONS = Object.freeze([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.markdown',
  '.html', '.css', '.scss', '.ics', '.yml', '.yaml', '.toml', '.txt', '.csv', '.snap',
]);

/**
 * List text files under `root`, sorted, with repo-relative POSIX paths.
 *
 * @param {string} root absolute path of the tree to scan
 * @param {{ ignoredDirs?: readonly string[], ignoredFiles?: readonly string[],
 *           extensions?: readonly string[], maxBytes?: number }} [options]
 * @returns {{ path: string, abs: string }[]}
 */
export function listTextFiles(root, options = {}) {
  const ignoredDirs = new Set(options.ignoredDirs ?? DEFAULT_IGNORED_DIRS);
  const ignoredFiles = new Set(options.ignoredFiles ?? DEFAULT_IGNORED_FILES);
  const extensions = new Set(options.extensions ?? TEXT_EXTENSIONS);
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const found = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip rather than fail the guard
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
      if (!extensions.has(extensionOf(entry.name))) continue;
      try {
        if (statSync(abs).size > maxBytes) continue;
      } catch {
        continue;
      }
      found.push({ path: toPosix(relative(root, abs)), abs });
    }
  };

  walk(root);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** Lowercase extension including the dot, or '' when there is none. */
export function extensionOf(name) {
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

/** Windows separators to POSIX, so findings print the same everywhere. */
export function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

/**
 * Read a file as UTF-8, or return null when it looks binary or cannot be read.
 * A NUL byte in the first 8 KiB is the heuristic; it is cheap and never wrong in practice.
 *
 * @param {string} abs
 * @returns {string | null}
 */
export function readTextFile(abs) {
  let buffer;
  try {
    buffer = readFileSync(abs);
  } catch {
    return null;
  }
  const probe = buffer.subarray(0, 8192);
  if (probe.includes(0)) return null;
  return buffer.toString('utf8');
}

/** Split file content into lines, keeping 1-based line numbers. */
export function linesOf(text) {
  return text.split(/\r?\n/);
}
