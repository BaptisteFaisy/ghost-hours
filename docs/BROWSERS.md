# Browsers

Ghost Hours is a link: whoever reviews it opens it in whatever they have — a
desktop browser, a phone, sometimes a private window, sometimes an in-app
browser. A blank screen there cancels everything else, so the compatibility
question is treated as a feature, not as a hope.

## The floor

| Layer | Floor | Why |
|---|---|---|
| Bundle syntax | Vite default `modules` target — Chrome 87, Firefox 78, Safari 14, Edge 88 | Nothing is configured above the default, so nothing is raised |
| Module workers | Safari 15, Chrome 80, Firefox 114 | `new Worker(url, { type: 'module' })`; below that the reconstruction falls back to the main thread |
| IndexedDB | Safari 10, Chrome 24, Firefox 10 | Used for persistence; `localStorage` then memory take over when it is unavailable or blocked |
| Flexbox `gap`, `:focus-visible` | Safari 14.1 / 15.4 | The only layout and focus features the stylesheet leans on beyond the basics |

The stylesheet deliberately avoids the recent and unevenly supported features:
no `:has()`, no `@container`, no `backdrop-filter`, no `dvh`/`svh`, no
`text-wrap: balance`.

## The four places a browser can say no

Each of these is a real behaviour difference, each has a fallback, and each
fallback has a test.

| Risk | Where it bites | What the app does | Proof |
|---|---|---|---|
| IndexedDB missing or blocked | Safari private window, some embedded browsers | `storageKind()` probes, falls back to `localStorage`, then to memory, and the Settings screen says which one is in use | `apps/web/src/state/persistence.ts`, `persistence.test.ts` |
| `localStorage` writes throw | Safari private window, storage disabled | Every access goes through `localStorageOrNull()`, which probes with a write and returns `null` on a throw | `apps/web/src/state/persistence.ts` |
| `File.text()` absent | Older Safari and WebViews | `readText()` uses `File.text()` when it exists, `FileReader` otherwise | `apps/web/src/state/fileImport.ts` |
| Worker refused or blocked | Safari < 15, strict CSP, `file://` | A constructor throw resolves with the synchronous reconstruction; a load error rejects and the store catches it and reconstructs on the main thread | `apps/web/src/state/reconstructAsync.ts`, `apps/web/src/state/store.tsx` |
| `window.open` blocked for printing | iOS Safari, in-app browsers (LinkedIn, Teams, Instagram) | `printOrSave()` saves the draft as an HTML file and the screen says so instead of doing nothing silently | `apps/web/src/lib/download.ts`, `download.test.ts`, `Invoice.test.tsx` |

## What is actually run, and where

| Engine | Suite | Where | Observed |
|---|---|---|---|
| Chromium (system Chrome) | `e2e/smoke.spec.ts` + `e2e/real-month.spec.ts` — 8 tests | every deploy (`.github/workflows/e2e.yml`) | green against the public URL |
| Chromium, iPhone 13 emulation (390×664, touch) | `e2e/mobile.spec.ts` — 4 tests | same workflow, same run | green — the phone layout, engine-independent, and no download |
| Firefox | the same desktop suites | `.github/workflows/browser-matrix.yml`, on demand | green **on the CI runner**: the browser installs there and stays cached |
| **WebKit — the real Safari engine** | the same desktop suites | **`.github/workflows/webkit.yml`, on a macOS runner, after every deploy** | **green — 12/12** |
| **WebKit, iPhone 13 emulation** | `e2e/mobile.spec.ts` — 4 tests | same run | green |

The repository is public, so GitHub-hosted runners are free — macOS included, the only platform where
Playwright runs the real WebKit and where the `isMobile` emulation of an iPhone exists. **No Mac and
no iPhone are needed** to check the Safari line: it runs after every deployment, on the public URL,
exactly like the other engines.

Run the whole matrix locally:

```bash
pnpm build
pnpm --filter @ghost-hours/web preview --port 4173 &
GHOST_HOURS_URL=http://localhost:4173/ghost-hours/ GHOST_HOURS_BROWSERS=all pnpm e2e
```

`GHOST_HOURS_BROWSERS` takes `all` or a comma-separated list of
`chromium,firefox,webkit,mobile-chromium,mobile-safari`. The default is
`chromium`, which is what CI runs on a pull request's budget.

## What WebKit found that the other engines did not

The first real WebKit run failed on its first try, on a bug no other engine had seen:

```
[mobile-safari] › e2e/mobile.spec.ts › phone 3 — nothing sticks out of the screen on any view
Error: view Month overflows by 274px (TABLE.month-clients right=664)
```

On a real iPhone 13 (390 px), the month's per-client table measured 664 px and pushed the **page**
wider: the reader scrolls sideways. WebKit honours a table's min-content width; Chromium squeezes the
cells, which is why the phone emulation passed. The fix (`apps/web/src/responsive.css`) makes a
table wider than the screen scroll inside its own box, and lets long words break — seven tables at
once, one rule.

This is the whole argument for running the real engine: the emulation proves the layout of the app
*as Chromium lays it out*.

## What is still not proven

A **physical** iPhone: the in-app browsers of LinkedIn, Instagram or Teams, the ergonomics of a real
thumb, the Safari settings a reader may have changed. The emulation covers the layout and the touch
events; it does not cover the device. This file says so rather than implying a tick that was never
observed — but the gap is now a device, not an engine.

On a Linux host, WebKit still cannot start: Playwright's build links against `libjxl.so.0.8` and
`libbacktrace.so.0`, absent from Ubuntu 24.04 (which ships `libjxl0.7`). That is why the Safari line
runs on macOS rather than here — and it no longer costs a human being.
