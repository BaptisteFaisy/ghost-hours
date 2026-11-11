import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';

/**
 * The narrow filesystem surface the collector needs.
 *
 * Everything the collector touches goes through this port, so tests can drive
 * the whole collection with an in-memory fake and so the read-only guarantee
 * (HEU-F-01) is auditable in one place: the collector only ever calls
 * `writeFile`/`rename` for the evidence file it was asked to produce.
 */

export interface DirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

export interface FileStat {
  readonly isDirectory: boolean;
}

export interface FsPort {
  readdir(path: string): Promise<readonly DirEntry[]>;
  stat(path: string): Promise<FileStat>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export function createNodeFs(): FsPort {
  return {
    async readdir(path) {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    },
    async stat(path) {
      const info = await stat(path);
      return { isDirectory: info.isDirectory() };
    },
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, data) => writeFile(path, data, 'utf8'),
    rename: (from, to) => rename(from, to),
    async mkdir(path) {
      await mkdir(path, { recursive: true });
    },
  };
}
