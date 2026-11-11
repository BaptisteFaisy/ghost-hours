import { slugify } from '@ghost-hours/core';

/**
 * Client tags written inside a note line.
 *
 * A tag names a client and comes in a few shapes: `#client:acme`, `#acme`,
 * `@acme` or `client: acme`. Every shape is case insensitive and
 * normalized with the core `slugify`, so `Acme`, `#ACME` and `client: Acme`
 * all describe the same client.
 */
export const DEFAULT_TAG_PREFIXES: readonly string[] = ['#', '@'];

/** `client: acme` — the explicit keyword form, always recognized. */
const KEYWORD_PATTERN = /\bclient:\s*([A-Za-z0-9][A-Za-z0-9_-]*)/gi;

/** Body of a prefixed tag: letters, digits, `_`, `-` and `:` (for `#client:acme`). */
const BODY_PATTERN = '[A-Za-z0-9][A-Za-z0-9_:-]*';

interface TagToken {
  readonly start: number;
  readonly end: number;
  /** Normalized client name. */
  readonly value: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prefixedPattern(prefixes: readonly string[]): RegExp | null {
  if (prefixes.length === 0) return null;
  const alternatives = prefixes.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\w.+-])(?:${alternatives})(${BODY_PATTERN})`, 'gi');
}

/**
 * Collect the tag tokens of a line, in reading order, without overlaps.
 * The keyword form and the prefixed form may match the same text: the
 * longest match wins.
 */
function findTagTokens(line: string, prefixes: readonly string[]): TagToken[] {
  const tokens: TagToken[] = [];
  for (const match of line.matchAll(KEYWORD_PATTERN)) {
    const body = match[1];
    if (body === undefined) continue;
    const start = match.index;
    tokens.push({ start, end: start + match[0].length, value: slugify(body) });
  }
  const prefixed = prefixedPattern(prefixes);
  if (prefixed !== null) {
    for (const match of line.matchAll(prefixed)) {
      const body = match[1];
      if (body === undefined) continue;
      const value = slugify(body.replace(/^client:/i, ''));
      if (value.length === 0) continue;
      const start = match.index;
      tokens.push({ start, end: start + match[0].length, value });
    }
  }
  return dedupeTokens(tokens);
}

function dedupeTokens(tokens: readonly TagToken[]): TagToken[] {
  const sorted = [...tokens].sort(
    (a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start),
  );
  const kept: TagToken[] = [];
  for (const token of sorted) {
    const last = kept[kept.length - 1];
    if (last !== undefined && token.start < last.end) continue;
    kept.push(token);
  }
  return kept;
}

/**
 * Client tags of a line, normalized and without duplicates, in reading
 * order. An empty line has no tag.
 */
export function extractTags(line: string, prefixes: readonly string[] = DEFAULT_TAG_PREFIXES): string[] {
  const values: string[] = [];
  for (const token of findTagTokens(line, prefixes)) {
    if (!values.includes(token.value)) values.push(token.value);
  }
  return values;
}

/** The line without its tags — used to keep the readable text of a note. */
export function stripTags(line: string, prefixes: readonly string[] = DEFAULT_TAG_PREFIXES): string {
  const tokens = findTagTokens(line, prefixes);
  let out = line;
  for (const token of [...tokens].reverse()) {
    out = out.slice(0, token.start) + out.slice(token.end);
  }
  return out;
}
