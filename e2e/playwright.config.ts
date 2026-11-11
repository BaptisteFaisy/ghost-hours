import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke suite (spec `.kiro/specs/e2e-smoke`).
 *
 * It drives the **built** application in a real browser, which is the only way
 * to prove three things: the bundle boots, the sample month reaches the screen
 * with the announced figures, and the page talks to nobody.
 *
 * It never runs on a pull request: a browser run costs tens of seconds and the
 * verdict of a pull request must land in five minutes. It runs after a deploy
 * and on demand.
 */

const BROWSER_CANDIDATES = [
  process.env.GHOST_HOURS_BROWSER ?? '',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path) => path.length > 0);

const executablePath = BROWSER_CANDIDATES.find((path) => existsSync(path));

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 1,
  reporter: [['list']],
  outputDir: 'artifacts',
  use: {
    baseURL: process.env.GHOST_HOURS_URL ?? 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
    // Video needs Playwright's own ffmpeg, which the CI server does not have
    // and which we refuse to download at every run. Traces and screenshots
    // need nothing extra, so they stay on. Set GHOST_HOURS_E2E_VIDEO=1 on a
    // workstation that has ffmpeg to record the run.
    video: process.env.GHOST_HOURS_E2E_VIDEO === '1' ? 'retain-on-failure' : 'off',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath === undefined ? {} : { executablePath, args: ['--no-sandbox'] },
  },
});
