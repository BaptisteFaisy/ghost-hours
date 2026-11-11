---
inclusion: always
---

# Ghost Hours — technology steering

## Exact stack (as installed in this repository)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.7, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler` | one root `tsconfig.base.json`, one `tsconfig.json` per package |
| Runtime | Node.js ≥ 22.6 (`engines`), CI on Node 22 LTS | code must not need a newer runtime |
| Packages | pnpm 9.15.4 workspaces (`packages/*`, `apps/*`) | never `pnpm install/add/remove`, never edit a `package.json` |
| Domain helpers | `@ghost-hours/core` — types, zod schemas, time, ids, formatting, CSV | reuse it; re-implementing it is a defect |
| Validation | zod 3.24 — every external input (`evidence.json`, `.ics`, JSON dataset, `localStorage`) | parse, never trust |
| UI | React 18 + Vite 5, static build, no server | `apps/web` |
| Tests | Vitest 2 (`environment: node`), `fast-check` 3.23, jsdom + Testing Library for DOM | tests next to sources |
| Lint | ESLint 9 flat config, `typescript-eslint`, `react`, `react-hooks`, `jsx-a11y` | `pnpm lint` = `eslint . --max-warnings 0` |
| CI | GitHub Actions, one job ≤ 5 min (`timeout-minutes: 5`) | offline: no network step |
| Licence | MIT | dependency licences listed in the README |

Playwright appears in the contest cahier but is **not installed** here; end-to-end runs are out of
the 5-minute CI budget in this edition (deviation recorded in `KIRO_JOURNAL.md`).

## Prohibitions — treat these as build errors

1. **No network, ever** (HEU-N-01). No `fetch`, no `XMLHttpRequest`, no `WebSocket`, no
   `navigator.sendBeacon`, no telemetry, no remote fonts, no CDN `<script src="http…">`, no
   `import.meta.env.VITE_*API*` endpoint. Guard: `scripts/check-no-network.mjs`, enforced by the
   `no-network` hook and by CI. The single optional exit is the HEU-F-10 model provider, off by
   default, behind a provider interface, and it needs an explicit decision before it lands.
2. **No new dependency without a decision.** Adding a package means: name it, justify it, check
   its licence (no strong copyleft), get a recorded decision, then the human owner adds it — not
   an agent. If a dependency is missing, stop and report it.
3. **No local-time date arithmetic in the domain** (HEU-N-02). No `getFullYear()`, `setHours()`,
   `new Date(y, m, d)`, no hard-coded `+01:00`/`+02:00`, no "a day is 24 h". Instants (epoch ms) and
   an explicit IANA `timeZone` only; use the `@ghost-hours/core` time helpers.
4. **Money is integer cents** (`Cents`). Never a float, never a formatted string in the domain.
   Durations are `Minutes` at API boundaries and milliseconds inside interval algebra.
5. **Files under 500 lines, functions under 50 lines.** ESLint enforces both (`max-lines`,
   `max-lines-per-function`). Split by responsibility, do not compress code to fit.
6. **Zero duplication.** Before writing a helper, grep `packages/core/src` for it. Time, ids,
   formatting, CSV and zod schemas already exist there.
7. **No `any`, no `@ts-ignore`, no non-null `!` to silence the compiler.** Narrow the type or
   return a `ParseResult`.
8. **No mutable global state in packages.** Pure functions in, values out; the UI holds state.
9. **No real client data** — see `privacy.md` and `scripts/check-privacy.mjs`.
10. **English everywhere** in code, identifiers, comments, tests, docs and UI strings. French
    exists only as an i18n dictionary in the web app.

## Determinism

Same input → same output. Never iterate an object or a `Map` built from unsorted input: sort
explicitly by a stable key (HEU-F-16, HEU-P-03). Ids come from `@ghost-hours/core` (`hashId`,
`blockId`, `commitEvidenceId`, …), never from `Math.random()` — except `randomId(prefix)` for
entities the user creates by hand.

## Definition of done for any task

`pnpm typecheck` green, `pnpm test` green for the touched packages, `pnpm lint` green, no file over
500 lines, no function over 50 lines, no new dependency, no network call, no real data.
