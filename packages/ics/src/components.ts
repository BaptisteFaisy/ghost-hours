/** Nested `BEGIN:`/`END:` components of an iCalendar stream (RFC 5545 §3.4). */

import type { ContentLine } from './content-line.ts';
import { parseContentLine } from './content-line.ts';
import type { UnfoldedLine } from './unfold.ts';

export interface RawComponent {
  /** Upper-cased component name, e.g. `VEVENT`. */
  readonly name: string;
  readonly properties: readonly ContentLine[];
  readonly children: readonly RawComponent[];
  readonly line: number;
}

export interface ComponentTree {
  readonly roots: readonly RawComponent[];
  readonly warnings: readonly string[];
}

interface MutableComponent {
  name: string;
  properties: ContentLine[];
  children: MutableComponent[];
  line: number;
}

function freeze(component: MutableComponent): RawComponent {
  return {
    name: component.name,
    properties: component.properties,
    children: component.children.map(freeze),
    line: component.line,
  };
}

/**
 * Builds the component tree. Malformed input never throws: a stray line, a
 * mismatched `END` or a missing `END` becomes a warning (risk D.15: nothing is
 * dropped silently).
 */
export function buildComponents(lines: readonly UnfoldedLine[]): ComponentTree {
  const roots: MutableComponent[] = [];
  const stack: MutableComponent[] = [];
  const warnings: string[] = [];
  for (const raw of lines) {
    if (raw.text.trim() === '') continue;
    const line = parseContentLine(raw);
    if (!line) {
      warnings.push(`line ${raw.line}: not a content line, ignored`);
      continue;
    }
    const current = stack[stack.length - 1];
    if (line.name === 'BEGIN') {
      const created: MutableComponent = { name: line.value.trim().toUpperCase(), properties: [], children: [], line: raw.line };
      (current ? current.children : roots).push(created);
      stack.push(created);
      continue;
    }
    if (line.name === 'END') {
      const closing = line.value.trim().toUpperCase();
      const open = stack.pop();
      if (!open) warnings.push(`line ${raw.line}: END:${closing} without a matching BEGIN`);
      else if (open.name !== closing) warnings.push(`line ${raw.line}: END:${closing} closes BEGIN:${open.name}`);
      continue;
    }
    if (!current) {
      warnings.push(`line ${raw.line}: ${line.name} outside any component, ignored`);
      continue;
    }
    current.properties.push(line);
  }
  for (const open of stack) warnings.push(`line ${open.line}: BEGIN:${open.name} is never closed`);
  return { roots: roots.map(freeze), warnings };
}
