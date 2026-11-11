#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'dist', 'cli.mjs');

if (!existsSync(cli)) {
  process.stderr.write(
    'ghost-hours: the collector bundle is missing.\n' +
      'Build it first:\n\n' +
      '  pnpm --filter @ghost-hours/collector build\n\n' +
      `Expected file: ${cli}\n`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });

if (result.error) {
  process.stderr.write(`ghost-hours: cannot run ${cli}: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
