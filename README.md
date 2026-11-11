# Ghost Hours

**Reconstruct the hours you actually worked — then draft the invoice.**

Independents bill by the hour or by the day, and they forget. On the 30th, Sofia rebuilds her month
from memory and reaches 92 hours. Her commits, her calendar and her notes show 104. The missing 12
hours are *ghost hours*: worked, never billed. At €65 an hour that is €780 this month.

Ghost Hours stitches together four worlds that never talk to each other — Git history, an iCalendar
agenda, dated Markdown notes and manual entries — and proposes blocks of time per client. You
confirm, adjust, split or reject each block; only confirmed blocks can be billed, and every billed
hour links back to the evidence that supports it. Everything happens in your browser: no account,
no server, no network call after the page loads.

Built for the [Kiroween 2026](https://kiroween.devpost.com/) hackathon, **Frankenstein** category.

## Try it

**<https://baptistefaisy.github.io/ghost-hours/>** — click **Load the sample month**. It loads a
fictitious November for a fictitious freelancer with three clients and shows:

> **104 h found · 92 h declared · 12 ghost hours · €780**

The month also holds one contradiction (two commits during another client's meeting) and three
blocks whose evidence is thin, so every state the reviewer has to tell apart is on screen. Those
numbers are not typed anywhere: `fixtures/sample-month/sample-month.test.ts` recomputes them
through the real pipeline, so they cannot drift from the product.

## Run it locally

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # 422 tests: unit + property (Vitest, fast-check)
pnpm typecheck      # TypeScript, strict
pnpm lint           # ESLint, including the 500-line and 50-line budgets
pnpm build          # static site in apps/web/dist
```

Node.js 22 or later, pnpm 9.

## Collect your own evidence

The collector is a read-only CLI: it walks directories, finds Git repositories, reads the commits of
one author across **all references** plus the reflog, and writes `evidence.json`. It never writes to
a repository — and that is a test, not a promise (see `docs/ACCEPTANCE.md`).

```bash
node packages/collector/bin/ghost-hours.mjs collect ~/code \
  --author you@example.com --since 2026-11-01 --out evidence.json
```

Then drop `evidence.json`, your `.ics` export and your notes folder into the app. Nothing is
uploaded: the files are parsed inside the tab.

## How it is put together

| Package | Role |
|---|---|
| `packages/core` | Domain types, Zod schemas, DST-safe time helpers, deterministic ids |
| `packages/intervals` | Interval algebra (union, difference, coverage) — the base of every property test |
| `packages/ics` | RFC 5545 subset reader: recurrences, time zones, exceptions |
| `packages/notes` | Dated Markdown notes: timestamps, client tags |
| `packages/mapping` | Rules that attach evidence to a client, and orphan detection |
| `packages/sessionizer` | The reconstruction algorithm: sessions, lead-ins, meetings, overlaps, confidence |
| `packages/billing` | Rounding, three billing modes, caps, invoice draft, evidence annex, exports |
| `packages/collector` | Read-only Git collector (CLI) |
| `apps/web` | Static Vite + React app: month, week, evidence, clients, invoice, settings |
| `fixtures/sample-month` | The fictitious month used by the demo and by the acceptance tests |

Design notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Acceptance checklist: [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).
Continuous integration: [`docs/CI.md`](docs/CI.md).

## How it was built with Kiro

The `.kiro/` folder is part of the product, not decoration:

- **10 steering files** — the rules the code actually follows (instants only, money in integer
  cents, no file over 500 lines, no network after load, no real client data, never inflate a bill).
  Four are domain-scoped with `fileMatch`: `time.md`, `evidence-format.md`, `ui.md`, `contest.md`.
- **6 specs** — `collector`, `ics-import`, `intervals`, `sessionizer`, `billing`, `review-ui`, each
  with EARS requirements carrying the `HEU-F-nn` identifiers of the specification, a design and a
  task list.
- **5 hooks** — the interval properties run on every save in `packages/{intervals,sessionizer}`; a
  fixture privacy guard; a no-network guard; a journal reminder after a spec task; a guard that
  refuses to let `.kiro` be gitignored. Four of the five are shell commands, which cost no credits.
- **3 custom agents** — `time-reviewer` and `prudence-reviewer` (read-only reviewers) and
  `property-tester` (turns a fast-check counterexample into a named test).
- **2 skills** — `sample-month` and `property-hunt`.

The running log is [`KIRO_JOURNAL.md`](KIRO_JOURNAL.md), with the eight questions of the submission
form. Numbers that can only be measured inside a Kiro session are marked `TODO(measure)` rather
than invented.

## Privacy

- No network request after the page loads; the evidence stays in IndexedDB (with a `localStorage`
  fallback) and can be erased from the Settings screen.
- No real client data in this repository: every fixture uses `example.com` / `example.org`
  addresses and invented companies. `.kiroignore` and `.gitignore` keep real evidence out of the
  tree, and `scripts/check-privacy.mjs` enforces it in CI.
- The optional model-assisted suggestion (HEU-F-10) is not wired in: the client suggestion for an
  orphan piece of evidence is purely heuristic, so there is a non-model path for everything.

## Dependencies and licences

Runtime: `react`, `react-dom` (MIT), `zod` (MIT). Build and test: `typescript` (Apache-2.0), `vite`
(MIT), `vitest` (MIT), `fast-check` (MIT), `esbuild` (MIT), `eslint` and its plugins (MIT),
`@testing-library/*` (MIT). No GPL or AGPL dependency, and the `.ics` reader is written here rather
than borrowed, so there is no copyleft question at all. The collector needs nothing beyond Node and
`git`. The complete list is in `pnpm-lock.yaml`.

## Pre-existing code

Every line of application code in this repository was written during the submission period; the
repository was created on 11 November 2026. The CI scaffolding under `.github/` (the `couche0`
scope guard, the merge sweeper and the conflict agent) and `.mergify.yml` are adapted from the
author's own open-source pipeline used in other repositories. They contain no application code.

## Licence

MIT — see [LICENSE](LICENSE).
