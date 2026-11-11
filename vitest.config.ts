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
  },
});
