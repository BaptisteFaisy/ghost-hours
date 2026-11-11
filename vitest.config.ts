import { defineConfig } from 'vitest/config';

/**
 * One runner for the whole workspace (CI budget: a single `vitest run`).
 * DOM tests declare their own environment with a `@vitest-environment` header.
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'fixtures/*/**/*.test.ts',
    ],
    environment: 'node',
    reporters: ['default'],
    testTimeout: 20_000,
    // The collector's hooks create real Git repositories; on a loaded
    // self-hosted runner a 10-second hook budget flakes (seen once, 2026-11-11).
    hookTimeout: 30_000,
  },
});
