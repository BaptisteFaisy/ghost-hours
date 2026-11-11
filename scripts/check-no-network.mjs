#!/usr/bin/env node
/**
 * check-no-network.mjs — the app never talks to the network (HEU-N-01).
 *
 * Scans `packages/**` and `apps/**` for the ways a browser or a Node program can open a
 * connection, and fails on any of them. Run by the `no-network` Kiro hook on save and by CI.
 *
 * Detected:
 *   - `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`
 *   - `import.meta.env.VITE_*API*` (a build-time endpoint baked into the bundle)
 *   - `<script src="http…"` / `<link href="http…"` in HTML (a CDN script or a remote font)
 *   - `require('http…')`, `from 'node:http…'` — a server or a client in a package
 *
 * Allowlist (the only documented exit):
 *   - `packages/core/src/llm/provider.ts` — the optional model provider of HEU-F-10. It is off by
 *     default, behind an interface, and it may only be added after a recorded decision. Nothing
 *     else in the tree may reach the network, and the demo build keeps it disabled.
 *
 * Escape hatch: a line ending with `// guard-allow: no-network` is skipped, with the reason written
 * next to it. Use it for a test asserting that a call is *absent*, never for real code.
 *
 * Comment-only lines are ignored: a comment cannot open a socket.
 *
 * Exit 0 clean, 1 findings, 2 usage error.
 */

import process from 'node:process';
import { join } from 'node:path';
import { listTextFiles, linesOf, readTextFile } from './lib/files.mjs';
import { Reporter, main, parseArgs, printUsage, wantsHelp } from './lib/report.mjs';

const NAME = 'check-no-network';

/** Directories to scan, relative to the root. */
const SCAN_DIRS = ['packages', 'apps'];

/** Extensions that can carry a request. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html', '.css'];

/** The only files allowed to contain a network call, with the reason. */
const ALLOWED_FILES = new Map([
  ['packages/core/src/llm/provider.ts', 'HEU-F-10 optional model provider, disabled by default'],
]);

const RULES = [
  { pattern: /\bfetch\s*\(/, message: 'fetch() opens a network request' },
  { pattern: /\bXMLHttpRequest\b/, message: 'XMLHttpRequest opens a network request' },
  { pattern: /\bWebSocket\b/, message: 'WebSocket opens a network connection' },
  { pattern: /\bEventSource\b/, message: 'EventSource opens a network connection' },
  { pattern: /navigator\s*\.\s*sendBeacon/, message: 'sendBeacon sends data off the machine' },
  {
    pattern: /import\.meta\.env\.VITE_[A-Z0-9_]*API/,
    message: 'a VITE_*API* endpoint is baked into the bundle',
  },
  {
    pattern: /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i,
    message: 'a remote script or stylesheet breaks the offline guarantee',
  },
  {
    pattern: /(?:require\s*\(\s*['"]|from\s+['"])(?:node:)?https?['"]/,
    message: 'importing an HTTP module means a request somewhere',
  },
];

const ESCAPE = '// guard-allow: no-network';

const USAGE = {
  name: `${NAME} — offline guarantee (HEU-N-01)`,
  summary: 'Fail when packages/ or apps/ contain a network call, a CDN asset or an API endpoint.',
  usage: 'node scripts/check-no-network.mjs [--root <dir>] [--help]',
  options: [
    ['--root <dir>', 'repository root (default: current directory)'],
    ['--help', 'print this help'],
  ],
  exits: [
    ['0', 'clean'],
    ['1', 'findings'],
    ['2', 'usage error'],
  ],
};

/** Drop block comments, comment-only lines and trailing line comments (never a `://`). */
export function stripComments(line) {
  let out = line.replace(/\/\*.*?\*\//g, ' ');
  const trimmed = out.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) return '';
  const marker = out.indexOf('//');
  if (marker > 0 && out[marker - 1] !== ':' && !out.slice(0, marker).includes('://')) {
    out = out.slice(0, marker);
  }
  return out;
}

/** Return the rules a single line violates. */
export function violationsOf(line) {
  const code = stripComments(line);
  if (code.trim() === '' || line.includes(ESCAPE)) return [];
  return RULES.filter((rule) => rule.pattern.test(code)).map((rule) => rule.message);
}

function run(argv) {
  if (wantsHelp(argv)) return printUsage(USAGE);

  const parsed = parseArgs(argv, { values: ['root'] });
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  const root = typeof parsed.flags.root === 'string' ? parsed.flags.root : process.cwd();

  const reporter = new Reporter(NAME);
  let scanned = 0;
  let skipped = 0;

  for (const dir of SCAN_DIRS) {
    for (const file of listTextFiles(join(root, dir), { extensions: EXTENSIONS })) {
      const relative = `${dir}/${file.path}`;
      if (ALLOWED_FILES.has(relative)) {
        skipped += 1;
        continue;
      }
      const text = readTextFile(file.abs);
      if (text === null) continue;
      scanned += 1;
      const lines = linesOf(text);
      for (let index = 0; index < lines.length; index += 1) {
        for (const message of violationsOf(lines[index])) {
          reporter.add(relative, index + 1, message);
        }
      }
    }
  }

  const code = reporter.finish({ scanned, what: 'source files' });
  if (skipped > 0) {
    process.stdout.write(`note: ${skipped} allowlisted file(s) skipped (see the header)\n`);
  }
  return code;
}

process.exitCode = main(NAME, () => run(process.argv.slice(2)));
