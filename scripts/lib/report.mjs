/**
 * Shared reporting helpers for the guards in `scripts/`.
 *
 * Conventions every guard follows (so the CI and the Kiro hooks behave the same way):
 *   - exit 0  : nothing to report
 *   - exit 1  : findings, the build should fail
 *   - exit 2  : refused / usage error (a hook interprets 2 as "block this tool call")
 *   - `--help` prints usage and exits 0
 *   - messages in English, findings printed as `file:line  message`
 *   - never touches the network, never writes a file
 */

import process from 'node:process';

const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);

export const red = (text) => paint('31', text);
export const green = (text) => paint('32', text);
export const dim = (text) => paint('2', text);
export const bold = (text) => paint('1', text);

/** True when the user asked for help. */
export function wantsHelp(argv) {
  return argv.includes('--help') || argv.includes('-h');
}

/**
 * Print a usage block and return exit code 0.
 *
 * @param {{ name: string, summary: string, usage: string, options?: [string, string][],
 *           exits?: [string, string][] }} spec
 */
export function printUsage(spec) {
  const out = process.stdout;
  out.write(`${bold(spec.name)}\n\n${spec.summary}\n\n${bold('Usage')}\n  ${spec.usage}\n`);
  if (spec.options?.length) {
    out.write(`\n${bold('Options')}\n`);
    for (const [flag, text] of spec.options) out.write(`  ${flag.padEnd(18)} ${text}\n`);
  }
  if (spec.exits?.length) {
    out.write(`\n${bold('Exit codes')}\n`);
    for (const [code, text] of spec.exits) out.write(`  ${code.padEnd(4)} ${text}\n`);
  }
  out.write('\nNo network access, no writes, standard library only.\n');
  return 0;
}

/** Collect findings and print them in a stable order. */
export class Reporter {
  #name;
  #findings = [];

  /** @param {string} name guard name, printed in the summary line */
  constructor(name) {
    this.#name = name;
  }

  /**
   * @param {string} file repo-relative path
   * @param {number} line 1-based line number, or 0 when the finding is about the file itself
   * @param {string} message short English sentence
   */
  add(file, line, message) {
    this.#findings.push({ file, line, message });
  }

  get count() {
    return this.#findings.length;
  }

  /** Print every finding as `file:line  message`, sorted by file then line. */
  print() {
    const sorted = [...this.#findings].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );
    for (const finding of sorted) {
      const where = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
      process.stdout.write(`${red(where)}  ${finding.message}\n`);
    }
  }

  /**
   * Print the summary and return the exit code.
   *
   * @param {{ scanned?: number, what?: string }} [summary]
   * @returns {0 | 1}
   */
  finish(summary = {}) {
    const scanned = summary.scanned;
    const what = summary.what ?? 'files';
    const scope = scanned === undefined ? '' : dim(` (${scanned} ${what} scanned)`);
    this.print();
    if (this.#findings.length === 0) {
      process.stdout.write(`${green('OK')}   ${this.#name}${scope}\n`);
      return 0;
    }
    process.stdout.write(
      `${red('FAIL')} ${this.#name} — ${this.#findings.length} finding(s)${scope}\n`,
    );
    return 1;
  }
}

/**
 * Run a guard body, turning an unexpected exception into a readable failure.
 *
 * @param {string} name
 * @param {() => number} body
 * @returns {number} exit code
 */
export function main(name, body) {
  try {
    return body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${red('FAIL')} ${name} — unexpected error: ${message}\n`);
    return 1;
  }
}

/**
 * Minimal `--flag value` parser. Unknown flags are a usage error, never silently ignored.
 *
 * @param {string[]} argv arguments after the script name
 * @param {{ booleans?: readonly string[], values?: readonly string[] }} spec
 * @returns {{ flags: Record<string, string | true> } | { error: string }}
 */
export function parseArgs(argv, spec = {}) {
  const booleans = new Set(spec.booleans ?? []);
  const values = new Set(spec.values ?? []);
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) return { error: `unexpected argument: ${arg}` };
    const name = arg.slice(2);
    if (booleans.has(name)) {
      flags[name] = true;
      continue;
    }
    if (values.has(name)) {
      const value = argv[index + 1];
      if (value === undefined) return { error: `missing value for --${name}` };
      flags[name] = value;
      index += 1;
      continue;
    }
    return { error: `unknown option: ${arg}` };
  }
  return { flags };
}
