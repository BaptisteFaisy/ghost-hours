/** RFC 5545 §3.1 line folding: a folded line continues with a space or a tab. */

export interface UnfoldedLine {
  /** Unfolded content line, verbatim (no trimming). */
  readonly text: string;
  /** 1-based number of the physical line the content line starts on. */
  readonly line: number;
}

export function unfoldWithNumbers(text: string): UnfoldedLine[] {
  const physical = text.split(/\r\n|\n|\r/);
  const out: UnfoldedLine[] = [];
  for (let index = 0; index < physical.length; index += 1) {
    const current = physical[index] ?? '';
    const isLast = index === physical.length - 1;
    if (isLast && current === '' && out.length > 0) continue;
    const previous = out[out.length - 1];
    if (previous && (current.startsWith(' ') || current.startsWith('\t'))) {
      out[out.length - 1] = { text: previous.text + current.slice(1), line: previous.line };
      continue;
    }
    out.push({ text: current, line: index + 1 });
  }
  return out;
}

export function unfoldLines(text: string): string[] {
  return unfoldWithNumbers(text).map((line) => line.text);
}
