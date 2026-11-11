import { chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * Bundles the CLI into `dist/cli.mjs`.
 *
 * One file, Node only: the package has no runtime dependency beyond Git and
 * Node itself (HEU-N-07), so `@ghost-hours/core` (and its zod schemas) are
 * inlined here and the published CLI needs nothing installed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, 'dist', 'cli.mjs');

await build({
  entryPoints: [join(here, 'src', 'cli.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'info',
});

await chmod(outfile, 0o755);
