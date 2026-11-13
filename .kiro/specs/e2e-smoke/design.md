# Design — `e2e-smoke`

## Shape

```
e2e/
├── smoke.spec.ts        the four requirements above, one test each
├── fixtures.ts          URL under test, expected figures (read from fixtures/sample-month/expected.json)
└── README.md            how to run it locally, how to record the video
.github/workflows/e2e.yml  workflow_dispatch + after deploy, timeout-minutes: 5
```

## Choices

- **Playwright**, Chromium only. It is the tool the specification names (section 0.4), it records a
  video and a trace out of the box, and it needs no test-runner glue: `@playwright/test` is enough.
- **The expected figures come from `fixtures/sample-month/expected.json`**, not from literals in the
  test: the acceptance test of the fixture and this smoke test then cannot disagree.
- **Network assertion** by listening to `request` events and failing on any URL whose origin is not
  the origin under test. Console errors are collected the same way.
- **Download assertion** with Playwright's `download` event; the file is read from the temporary
  path and must be non-empty and parse as CSV.
- **Runner**: the self-hosted workers do not ship a browser. Two options, in order of preference:
  1. `npx playwright install --with-deps chromium` cached in a machine-local directory
     (`PLAYWRIGHT_BROWSERS_PATH=$HOME/tools/ms-playwright`), installed once by hand;
  2. fall back to the system Chrome with `channel: 'chrome'` and `executablePath` — the repository
     already has a toolchain script that finds local tools (`.github/ci/toolchain.sh`); add the same
     lookup for the browser.
  The workflow must not download a browser on every run: that alone would break the five-minute
  budget.
- **Never a pull-request check.** It runs after the deploy workflow succeeds and on demand, so a
  reviewer's verdict stays under five minutes.

## Errors

| Case | Behaviour |
|---|---|
| URL unreachable | fail fast with the URL and the HTTP status |
| Browser missing | fail with the install command, not a stack trace |
| Counter absent after five seconds | fail with a screenshot attached |
| A request to a foreign origin | fail with the full list of requests seen |

## Testing

The suite is the test. Its own smoke check: run it against a deliberately wrong URL and confirm it
fails with a readable message rather than a timeout.
