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

## What each test proves

| Test | Requirement | Proves |
|---|---|---|
| requirement 1 | HEU-F-30 | One click loads the month; the counter shows the figures of `fixtures/sample-month/expected.json` (104 h found, 92 h declared, 12 ghost hours, €780.00) |
| requirement 2 | HEU-N-01 | Across all six screens, **no request to a foreign origin** and no console error |
| requirement 3 | D.7 P4→P7 | The week grid renders, confirming a day raises the confirmed hours, the invoice says **Draft** with no number pattern, and the CSV export produces a real download |
| requirement 3b | HEU-F-14 | The contradiction of 16 November is on the Conflicts screen with both *Keep* gestures and *Share the minutes* |

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
