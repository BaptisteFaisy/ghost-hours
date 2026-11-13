# End-to-end smoke suite

A real browser drives the **built** application. This is the only place where
three claims are proven rather than asserted: the bundle boots, the sample
month reaches the screen with the announced figures, and the page talks to
nobody.

Two suites cover the happy path (`smoke.spec.ts`, `real-month.spec.ts`); a
third one covers the **hostile** path (`hostile.spec.ts`): the browsers that
refuse to work.

Spec: [`.kiro/specs/e2e-smoke/`](../.kiro/specs/e2e-smoke).

## Run it locally

```bash
pnpm install
pnpm build
pnpm --filter @ghost-hours/web preview --port 4173 &
GHOST_HOURS_URL=http://localhost:4173/ghost-hours/ pnpm e2e
```

Against the public site instead:

```bash
GHOST_HOURS_URL=https://tradoooo.github.io/ghost-hours/ pnpm e2e
```

The browser is the system one: `GHOST_HOURS_BROWSER` if set, otherwise the
first of `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`,
`/usr/bin/chromium`, `/usr/bin/chromium-browser`. Nothing is downloaded.

## Three suites, five projects

`smoke.spec.ts` is the desktop suite; `mobile.spec.ts` is the phone suite — the
link a judge opens on an iPhone. Which projects run is decided by
`GHOST_HOURS_BROWSERS` (default `chromium`, `all` for everything):

```bash
GHOST_HOURS_BROWSERS=all pnpm e2e                          # the whole matrix
GHOST_HOURS_BROWSERS=firefox,mobile-chromium pnpm e2e     # a part of it
```

| Project | Engine | Viewport | Suite | Needs a download |
|---|---|---|---|---|
| `chromium` | system Chromium | 1440×900 | desktop | no |
| `firefox` | Playwright Firefox | 1280×720 | desktop | yes |
| `webkit` | Playwright WebKit | 1280×720 | desktop | yes |
| `mobile-chromium` | system Chromium | iPhone 13, 390×664, touch | phone | no |
| `mobile-small` | system Chromium | iPhone SE, 320×568, touch | phone | no |
| `mobile-safari` | Playwright WebKit | iPhone 13, 390×664, touch | phone | yes |

The desktop projects run `smoke`, `real-month` and `hostile`; the phone
projects run `mobile`.

Shared gestures live in `e2e/helpers.ts` so the suites drive the app the
same way. What each browser covers, and the WebKit gap on this Linux host, is
written down in [`docs/BROWSERS.md`](../docs/BROWSERS.md).

## The hostile browser suite

WebKit does not run on the Linux runners, and what Safari refuses is not its
rendering: private browsing where IndexedDB and `localStorage` refuse to
write, in-app browsers where `window.open` is blocked, module workers refused,
`File.text()` missing in old WebKit. Each of these refusals has a fallback in
the code and a jsdom test — and a jsdom test proves the logic is *written*, not
that it holds in a browser.

`hostile.spec.ts` injects the failures with `page.addInitScript`, **before**
the page loads, so the application meets the refusal from its first line. The
strings it expects come from the dictionary itself
(`apps/web/src/i18n/en.ts`, imported by the spec): no sentence is copied into
a test.

| Test | Injected fault | What it proves |
|---|---|---|
| hostile 1 | `indexedDB` removed, `localStorage.setItem` throws | The app starts, the month shows its figures, an `alert` says the data cannot be saved, Settings announces the memory store, and confirming a day still moves the counter — the state lives in memory (`apps/web/src/state/persistence.ts`) |
| hostile 2 | `indexedDB.open` fails | The fallback is silent: the month loads, the data lands in `localStorage`, Settings says so, nothing is thrown and the console stays clean (`apps/web/src/state/persistence.ts`) |
| hostile 3 | `window.open` returns `null` | The print gesture saves the draft as an `.html` file and a `status` says it did (`apps/web/src/lib/download.ts`) |
| hostile 4 | `Worker` deleted, then a `Worker` whose constructor throws | Above 2 000 proofs the reconstruction moves to a worker: a refused worker falls back to the main thread and the figures do not move (`apps/web/src/state/reconstructAsync.ts`, `apps/web/src/state/stateHelpers.ts`) |
| hostile 5 | `File.prototype.text` removed | The import goes through `FileReader` and Settings announces the number of imported proofs (`apps/web/src/state/fileImport.ts`) |

Two of them need a little machinery, and it is worth saying why:

- **hostile 4** compares two runs of the *same* import: one where the worker
  works, one where the browser refuses to build it. The file is built from the
  sample fixture with more proofs than the worker threshold (2 000), so the
  worker path is really taken — the count of constructor calls says so — and
  the two months must show the same figures.
- **hostile 5** uploads a real file: the first proofs of
  `fixtures/sample-month/evidence.json`, sent to the "Import evidence (JSON)"
  field of the Settings screen.

## What each test proves

| Test | Requirement | Proves |
|---|---|---|
| requirement 1 | HEU-F-30 | One click loads the month; the counter shows the figures of `fixtures/sample-month/expected.json` (104 h found, 92 h declared, 12 ghost hours, €780.00) |
| requirement 2 | HEU-N-01 | Across all six screens, **no request to a foreign origin** and no console error |
| requirement 3 | D.7 P4→P7 | The week grid renders, confirming a day raises the confirmed hours, the invoice says **Draft** with no number pattern, and the CSV export produces a real download |
| requirement 3b | HEU-F-14 | The contradiction of 16 November is on the Conflicts screen with both *Keep* gestures and *Share the minutes* |
| phone 1 | R-09 | The page boots at 390 px with real text on it — not a blank screen — and talks to nobody |
| phone 2 | R-09 | The sample month loads on a phone and its counter fits inside the viewport |
| phone 3 | R-09 | No view is wider than the screen: nothing forces a sideways scroll |
| phone 4 | R-09 | A thumb reaches all five destinations and each of them renders |

The five `hostile` tests are described in the section above: they inject the
refusals of Safari and prove the fallbacks hold in a real browser.

The expected figures are read from the fixture, never copied into the test: if
the product changes, one file changes.

## In continuous integration

`.github/workflows/e2e.yml` runs it **after a successful deploy** (against the
public URL) and on **`workflow_dispatch`** (against a local preview of the
branch). It never runs on a pull request: a browser run must not eat the
five-minute budget that reviewers wait for. Traces and screenshots of a failure are
uploaded as the `e2e-artifacts` build artifact. Video is off by default because it needs
Playwright's own `ffmpeg`, absent from the CI server: set `GHOST_HOURS_E2E_VIDEO=1` on a machine
that has it.

## Recording the submission video

The same browser, driven by `~/Bureau/ghost-hours-video/record.mjs`, produces
the silent cut of the demo (14 shots, then `ffmpeg` to MP4). Keep the e2e suite
green before recording: a red smoke test means the video would show a lie.
