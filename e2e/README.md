# End-to-end smoke suite

A real browser drives the **built** application. This is the only place where
three claims are proven rather than asserted: the bundle boots, the sample
month reaches the screen with the announced figures, and the page talks to
nobody.

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
GHOST_HOURS_URL=https://baptistefaisy.github.io/ghost-hours/ pnpm e2e
```

The browser is the system one: `GHOST_HOURS_BROWSER` if set, otherwise the
first of `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`,
`/usr/bin/chromium`, `/usr/bin/chromium-browser`. Nothing is downloaded.

## Two suites, five projects

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
| `mobile-safari` | Playwright WebKit | iPhone 13, 390×664, touch | phone | yes |

Shared gestures live in `e2e/helpers.ts` so the two suites drive the app the
same way. What each browser covers, and the WebKit gap on this Linux host, is
written down in [`docs/BROWSERS.md`](../docs/BROWSERS.md).

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
