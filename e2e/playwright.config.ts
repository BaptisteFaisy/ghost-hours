import { existsSync } from 'node:fs';
import { devices, defineConfig } from '@playwright/test';
import type { PlaywrightTestProject } from '@playwright/test';

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
 *
 * Two matrices live here. The default one is the CI matrix: a single browser,
 * the system Chromium, because the CI server has no other and downloads
 * nothing. The full one — `GHOST_HOURS_BROWSERS=chromium,firefox,webkit,
 * mobile-chromium,mobile-safari` — is the reviewer matrix: the submission link may well be
 * opened on a phone or in Safari, and a blank screen there cancels everything
 * else. See `e2e/README.md`.
 */

const BROWSER_CANDIDATES = [
  process.env.GHOST_HOURS_BROWSER ?? '',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path) => path.length > 0);

const executablePath = BROWSER_CANDIDATES.find((path) => existsSync(path));

/** Every project the suite knows, in the order a reviewer would read them. */
const KNOWN_PROJECTS = ['chromium', 'firefox', 'webkit', 'mobile-chromium', 'mobile-safari'] as const;

type ProjectName = (typeof KNOWN_PROJECTS)[number];

function wantedProjects(): readonly ProjectName[] {
  const raw = process.env.GHOST_HOURS_BROWSERS ?? 'chromium';
  const asked = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is ProjectName => (KNOWN_PROJECTS as readonly string[]).includes(name));
  if (asked.length === 0) {
    throw new Error(
      `GHOST_HOURS_BROWSERS="${raw}" selects no project. Known: ${KNOWN_PROJECTS.join(', ')}, or "all".`,
    );
  }
  return asked;
}

const asked =
  (process.env.GHOST_HOURS_BROWSERS ?? '').trim().toLowerCase() === 'all'
    ? KNOWN_PROJECTS
    : wantedProjects();

const selected = new Set<string>(asked);

/** The desktop suites: the fictitious month and the real one, 1440×900. */
const DESKTOP = { testMatch: /(smoke|real-month|hostile)\.spec\.ts/ } as const;

/** The phone suite: the link a judge opens — does it boot, is it readable. */
const MOBILE = { testMatch: /mobile\.spec\.ts/ } as const;

const PROJECTS: PlaywrightTestProject[] = [
  {
    name: 'chromium',
    ...DESKTOP,
    use: {
      ...devices['Desktop Chrome'],
      // The CI server has a system Chrome and refuses downloads: use it.
      launchOptions: executablePath === undefined ? {} : { executablePath, args: ['--no-sandbox'] },
    },
  },
  {
    name: 'firefox',
    ...DESKTOP,
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    ...DESKTOP,
    use: { ...devices['Desktop Safari'] },
  },
  {
    name: 'mobile-chromium',
    ...MOBILE,
    // The same phone as the Safari line below — 390×664, touch — but on
    // Chromium, so the layout questions are answered on any host, even one
    // without WebKit. Only the engine changes between the two. It uses the
    // system browser when there is one: mobile emulation is a Chromium feature,
    // so the CI server runs the phone suite without downloading anything.
    use: {
      ...devices['iPhone 13'],
      browserName: 'chromium' as const,
      launchOptions: executablePath === undefined ? {} : { executablePath, args: ['--no-sandbox'] },
    },
  },
  {
    name: 'mobile-safari',
    ...MOBILE,
    // iPhone 13: WebKit, 390×663, touch, device scale factor 3.
    use: { ...devices['iPhone 13'] },
  },
].filter((project) => selected.has(project.name ?? ''));

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 1,
  reporter: [['list']],
  outputDir: 'artifacts',
  use: {
    baseURL: process.env.GHOST_HOURS_URL ?? 'http://localhost:4173',
    locale: 'en-GB',
    // Video needs Playwright's own ffmpeg, which the CI server does not have
    // and which we refuse to download at every run. Traces and screenshots
    // need nothing extra, so they stay on. Set GHOST_HOURS_E2E_VIDEO=1 on a
    // workstation that has ffmpeg to record the run.
    video: process.env.GHOST_HOURS_E2E_VIDEO === '1' ? 'retain-on-failure' : 'off',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: PROJECTS,
});
