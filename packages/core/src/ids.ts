/**
 * Deterministic identifiers.
 *
 * Re-importing the same evidence must not create a new entity (HEU-F-06,
 * HEU-P-14), so every id derived from data is a hash of that data. Only
 * user-created entities (a client, a rule, a manual block) get a random id.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** FNV-1a over UTF-8 bytes: small, stable, dependency free. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashId(input: string): string {
  return fnv1a(input).toString(36);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function commitEvidenceId(repo: string, sha: string): string {
  return `git:${repo}:${sha.slice(0, 12)}`;
}

export function checkoutEvidenceId(repo: string, at: number, to: string): string {
  return `git:${repo}:reflog:${at}:${hashId(to)}`;
}

export function meetingEvidenceId(uid: string, start: number): string {
  return `ics:${uid}:${start}`;
}

export function noteEvidenceId(file: string, line: number, at: number): string {
  return `note:${file}:${line}:${at}`;
}

export function manualEvidenceId(start: number, end: number): string {
  return `manual:${start}:${end}:${hashId(`${start}-${end}`)}`;
}

/** A block id depends only on its bounds, client and origin: it is stable. */
export function blockId(start: number, end: number, clientId: string, origin: string): string {
  return `blk:${hashId(`${start}|${end}|${clientId}|${origin}`)}`;
}

export function conflictId(start: number, end: number, blockIds: readonly string[]): string {
  return `cfl:${hashId(`${start}|${end}|${[...blockIds].sort().join(',')}`)}`;
}

export function ruleId(clientId: string, type: string, value: string): string {
  return `rule:${hashId(`${clientId}|${type}|${value.toLowerCase()}`)}`;
}

/** Random id for user-created entities. Not used for anything derived. */
export function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}
