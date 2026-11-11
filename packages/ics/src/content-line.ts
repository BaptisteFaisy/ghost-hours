/** RFC 5545 §3.1 content line: `NAME;PARAM=VALUE:value`. */

import type { UnfoldedLine } from './unfold.ts';

export interface ContentLine {
  /** Upper-cased property name. */
  readonly name: string;
  /** Upper-cased parameter names to their values (quotes stripped). */
  readonly params: Readonly<Record<string, readonly string[]>>;
  /** Raw value, still escaped. */
  readonly value: string;
  readonly line: number;
}

export function splitUnquoted(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of input) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === separator && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

export function indexOfUnquoted(input: string, target: string): number {
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') quoted = !quoted;
    else if (char === target && !quoted) return index;
  }
  return -1;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function parseParams(segments: readonly string[]): Record<string, string[]> {
  const params: Record<string, string[]> = {};
  for (const segment of segments) {
    const equals = segment.indexOf('=');
    if (equals < 0) continue;
    const key = segment.slice(0, equals).trim().toUpperCase();
    if (key === '') continue;
    const values = splitUnquoted(segment.slice(equals + 1), ',').map(unquote);
    params[key] = [...(params[key] ?? []), ...values];
  }
  return params;
}

const NAME_PATTERN = /^[A-Z0-9-]+$/;

export function parseContentLine(raw: UnfoldedLine): ContentLine | null {
  const colon = indexOfUnquoted(raw.text, ':');
  if (colon < 0) return null;
  const segments = splitUnquoted(raw.text.slice(0, colon), ';');
  const name = (segments[0] ?? '').trim().toUpperCase();
  if (!NAME_PATTERN.test(name)) return null;
  return { name, params: parseParams(segments.slice(1)), value: raw.text.slice(colon + 1), line: raw.line };
}

/** RFC 5545 §3.3.11 TEXT escaping. Unknown escapes keep their backslash. */
export function unescapeText(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    index += 1;
    if (next === 'n' || next === 'N') out += '\n';
    else if (next === '\\' || next === ';' || next === ',') out += next;
    else out += `\\${next}`;
  }
  return out;
}
