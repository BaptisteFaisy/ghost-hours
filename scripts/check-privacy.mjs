#!/usr/bin/env node
/**
 * check-privacy.mjs — no real client data in the tree (HEU-N-06).
 *
 * The repository is public. Every email address and every domain in it must be fictitious.
 * This guard walks the tree and fails on anything outside the allowed set below. It runs as the
 * `fixture-privacy-guard` Kiro hook on save and again in CI, because hooks only see agent edits.
 *
 * Allowed, and nothing else:
 *   - domains: example.com / .org / .net / .edu, localhost, and any subdomain of those
 *     (`acme.example.org` is fine), plus anything under `.invalid` (RFC 2606)
 *   - tooling metadata: the documentation and schema hosts in TOOLING_DOMAINS, which appear in
 *     `$schema` values and lint links, never in data
 *
 * What counts as "a domain to judge" — deliberately narrow, because a guard that cries wolf gets
 * switched off:
 *   - every email address, everywhere
 *   - every URL host, everywhere
 *   - quoted strings in source files (a domain literal in a test is data)
 *   - bare tokens in data files (.json, .ics, .yaml, .csv, .html, .txt)
 *   Markdown prose is judged on emails and URLs only: `record.at` and `client.name` are property
 *   names, not domains.
 *
 * Output: `path:line  message`. Exit 0 clean, 1 findings, 2 usage error.
 */

import process from 'node:process';
import { listTextFiles, linesOf, readTextFile } from './lib/files.mjs';
import { Reporter, main, parseArgs, printUsage, wantsHelp } from './lib/report.mjs';

const NAME = 'check-privacy';

const ALLOWED_DOMAINS = Object.freeze([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'localhost',
]);

/** Suffixes allowed wholesale: `.invalid` is reserved by RFC 2606 for exactly this use. */
const ALLOWED_SUFFIXES = Object.freeze(['.invalid']);

/** Documentation and schema hosts. Not data; if one appears in a fixture, look twice. */
const TOOLING_DOMAINS = Object.freeze([
  'schemastore.org',
  'eslint.org',
  'nodejs.org',
  'typescriptlang.org',
  'vitest.dev',
  'vitejs.dev',
  'react.dev',
  'github.com',
  'pnpm.io',
  'npmjs.com',
  'kiro.dev',
  // This project's own public hosts and the services its pipeline calls.
  'github.io',
  'githubusercontent.com',
  'devpost.com',
  'fireworks.ai',
  'mergify.com',
]);

/**
 * TLD list, deliberately short: a generic `[a-z]{2,}` would match `index.ts` and `fr.ts`.
 * Anything outside this list is not treated as a domain at all.
 */
const TLDS = Object.freeze([
  'com', 'org', 'net', 'edu', 'io', 'dev', 'app', 'cloud', 'tech', 'ai', 'info', 'biz', 'xyz',
  'site', 'online', 'store', 'shop', 'agency', 'studio', 'consulting', 'solutions', 'design',
  'works', 'group', 'digital', 'systems', 'network', 'media', 'email', 'live', 'world', 'today',
  'zone', 'ninja', 'expert', 'guru', 'coach', 'cafe', 'city', 'plus', 'page', 'blog', 'name',
  'pro', 'fr', 'be', 'ch', 'lu', 'ca', 'us', 'uk', 'de', 'es', 'it', 'nl', 'pt', 'se', 'no',
  'dk', 'fi', 'pl', 'ie', 'at', 'jp', 'cn', 'in', 'br', 'au', 'nz', 'za', 'il', 'tr', 'kr', 'sg',
  'mx', 'ar', 'cl', 'eu', 'me', 'tv', 'gg', 'sh', 'so', 'invalid',
]);

/**
 * TLDs that are also everyday JavaScript property names. In prose and in unquoted code,
 * `record.at`, `client.name` and `author.email` are not domains — so bare tokens are judged
 * against the list without them. Emails and URLs keep the full list.
 */
const COLLIDING_TLDS = Object.freeze(['at', 'name', 'email']);

/**
 * Suffixes that are file extensions in this repository. `toolchain.sh` and
 * `notes.ics` are names, not domains — a guard that flags them gets ignored.
 */
const FILE_EXTENSIONS = Object.freeze([
  'sh', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'md', 'mdx', 'json', 'yaml', 'yml',
  'ics', 'css', 'html', 'txt', 'toml', 'lock', 'svg', 'png', 'map', 'log', 'bak',
]);

const CONSERVATIVE_TLDS = Object.freeze(
  TLDS.filter((tld) => !COLLIDING_TLDS.includes(tld) && !FILE_EXTENSIONS.includes(tld)),
);

const DATA_EXTENSIONS = Object.freeze(['.json', '.ics', '.yaml', '.yml', '.csv', '.html', '.txt']);
const CODE_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/([A-Za-z0-9.-]+)/gi;
const DOMAIN_RE = /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}\b/g;

const USAGE = {
  name: `${NAME} — fictional data guard (HEU-N-06)`,
  summary:
    'Fail when an email address or a domain outside the fictional allowlist appears in the tree.',
  usage: 'node scripts/check-privacy.mjs [--root <dir>] [--help]',
  options: [
    ['--root <dir>', 'tree to scan (default: current directory)'],
    ['--help', 'print this help'],
  ],
  exits: [
    ['0', 'clean'],
    ['1', 'findings'],
    ['2', 'usage error'],
  ],
};

/** True when `domain` may appear in the repository. Subdomains of an allowed domain are allowed. */
export function isAllowedDomain(domain) {
  const lower = domain.toLowerCase();
  if (ALLOWED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  const hosts = [...ALLOWED_DOMAINS, ...TOOLING_DOMAINS];
  return hosts.some((host) => lower === host || lower.endsWith(`.${host}`));
}

/** True when the token ends in a known TLD, so it is worth judging at all. */
function looksLikeDomain(token, tlds) {
  const tld = token.slice(token.lastIndexOf('.') + 1).toLowerCase();
  if (FILE_EXTENSIONS.includes(tld)) return false;
  return tlds.includes(tld);
}

/** Judge one domain token; `tlds` decides whether it is domain-shaped at all. */
function judgeDomain(reporter, path, lineNumber, token, tlds, seen, kind = 'domain') {
  if (!looksLikeDomain(token, tlds)) return;
  if (isAllowedDomain(token)) return;
  if (seen.has(token)) return;
  seen.add(token);
  reporter.add(path, lineNumber, `${kind} "${token}" is not a fictional domain`);
}

/** Scan a fragment for bare domain tokens. */
function scanTokens(reporter, path, lineNumber, fragment, tlds, seen) {
  for (const match of fragment.matchAll(DOMAIN_RE)) {
    judgeDomain(reporter, path, lineNumber, match[0], tlds, seen);
  }
}

/** Scan one line of a file, applying the context rules described in the header. */
function scanLine(reporter, path, lineNumber, line, extension) {
  const seen = new Set();
  for (const match of line.matchAll(EMAIL_RE)) {
    judgeDomain(reporter, path, lineNumber, match[1], TLDS, seen, 'email domain');
  }
  for (const match of line.matchAll(URL_RE)) {
    const host = match[1].replace(/\.$/, '');
    if (host.includes('.')) judgeDomain(reporter, path, lineNumber, host, TLDS, seen, 'URL host');
  }
  if (CODE_EXTENSIONS.includes(extension)) {
    // In code, only an email address or a URL host is a domain. A dotted
    // identifier — an i18n key such as `common.no`, a file name, a package
    // name — is not a client domain, and a guard that cries wolf is ignored.
    // Data files (JSON, ICS, Markdown, CSV) stay strict.
    return;
  }
  if (DATA_EXTENSIONS.includes(extension)) {
    scanTokens(reporter, path, lineNumber, line, CONSERVATIVE_TLDS, seen);
  }
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
  const files = listTextFiles(root);

  for (const file of files) {
    const text = readTextFile(file.abs);
    if (text === null) continue;
    const extension = file.path.slice(file.path.lastIndexOf('.')).toLowerCase();
    const lines = linesOf(text);
    for (let index = 0; index < lines.length; index += 1) {
      scanLine(reporter, file.path, index + 1, lines[index], extension);
    }
  }

  return reporter.finish({ scanned: files.length, what: 'files' });
}

process.exitCode = main(NAME, () => run(process.argv.slice(2)));
