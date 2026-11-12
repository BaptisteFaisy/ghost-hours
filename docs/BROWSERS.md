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

| Engine | Suite | Where |
|---|---|---|
| Chromium (system Chrome) | `e2e/smoke.spec.ts` — 4 tests | every deploy and every pull request's post-deploy run (`.github/workflows/e2e.yml`) |
| Chromium, iPhone 13 emulation (390×664, touch) | `e2e/mobile.spec.ts` — 4 tests | same workflow: the phone layout is engine-independent, and mobile emulation needs no download |
| Firefox | `e2e/smoke.spec.ts` | `.github/workflows/browser-matrix.yml`, on demand; run locally before a submission |
| WebKit (Safari engine), desktop | `e2e/smoke.spec.ts` | same, on a host that can run WebKit |
| WebKit, iPhone 13 emulation | `e2e/mobile.spec.ts` | same |

Run the whole matrix locally:

```bash
pnpm build
pnpm --filter @ghost-hours/web preview --port 4173 &
GHOST_HOURS_URL=http://localhost:4173/ghost-hours/ GHOST_HOURS_BROWSERS=all pnpm e2e
```

`GHOST_HOURS_BROWSERS` takes `all` or a comma-separated list of
`chromium,firefox,webkit,mobile-chromium,mobile-safari`. The default is
`chromium`, which is what CI runs on a pull request's budget.

## The honest gap: WebKit on this Linux host

Firefox runs. WebKit does not, on Linux Mint 22 / Ubuntu 24.04: Playwright's
WebKit build links against `libjxl.so.0.8` and `libbacktrace.so.0`, and the
distribution ships `libjxl0.7` and no `libbacktrace0` at all. Extracting the
`.deb` files by hand covers `libavif16`, `libgav1` and `libyuv` and still leaves
those two missing, so WebKit refuses to launch.

The Safari line is therefore covered three ways instead of one:

1. everything engine-independent (layout, touch, reachability, blank screen) is
   run on Chromium with the iPhone 13 viewport, in CI;
2. every API where Safari behaves differently has a fallback and a unit test
   (table above);
3. the `webkit` and `mobile-safari` projects stay in the configuration, so a
   macOS machine — or a Linux host with those two libraries — runs the real
   thing with `GHOST_HOURS_BROWSERS=all`, no code change.

Before the submission the real Safari run should happen once on a Mac or an
iPhone; until then this file says so rather than implying a green tick that was
never observed.
