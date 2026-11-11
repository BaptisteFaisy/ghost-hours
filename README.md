# Ghost Hours

**Reconstruct the hours you actually worked — then draft the invoice.**

Independents bill by the hour or by the day, and they forget. On the 30th, Sofia rebuilds her
month from memory and reaches 92 hours. Her commits, her calendar and her notes show 104. The
missing 12 hours are *ghost hours*: worked, never billed. At €65 an hour that is €780 this month.

Ghost Hours stitches together four worlds that never talk to each other — Git history, an
iCalendar agenda, dated Markdown notes and manual entries — and proposes blocks of time per
client. You confirm, adjust, split or reject each block; only confirmed blocks can be billed, and
every billed hour links back to the evidence that supports it. Everything happens in your browser:
no account, no server, no network call.

Built for the [Kiroween 2026](https://kiroween.devpost.com/) hackathon, **Frankenstein** category.

## Try it

**<https://baptistefaisy.github.io/ghost-hours/>** — click **Load the sample month**: a fictitious
month for a fictitious freelancer with three clients (104 h found, 92 h declared, 12 ghost hours,
€780). No account, nothing to install, no data leaves the page.

## Run it locally

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # unit + property tests (Vitest, fast-check)
pnpm typecheck      # TypeScript, strict
pnpm build          # static site in apps/web/dist
```

Node.js 22 or later, pnpm 9.

## Collect your own evidence

The collector is a read-only CLI: it walks directories, finds Git repositories, reads the commits
of one author across all references plus the reflog, and writes `evidence.json`. It never writes to
a repository.

```bash
node packages/collector/bin/ghost-hours.mjs collect ~/code \
  --author you@example.com --since 2026-11-01 --out evidence.json
```

Then drop `evidence.json`, your `.ics` export and your notes folder into the app. Nothing is
uploaded: the files are parsed in the tab.

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

Design notes live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the Kiro specification, the
steering files, the hooks and the journal are in [`.kiro/`](.kiro) and
[`KIRO_JOURNAL.md`](KIRO_JOURNAL.md).

## Privacy

- No network request after the page loads. The app is a static bundle; the evidence stays in
  IndexedDB (with a `localStorage` fallback).
- No real client data in this repository: every fixture uses `example.com` / `example.org`
  addresses and invented companies. `.kiroignore` and `.gitignore` keep real evidence files out of
  the tree, and a CI check (`scripts/check-privacy.mjs`) enforces it.
- The optional model-assisted suggestion (a client for an orphan piece of evidence) is off by
  default and has a non-model path.

## Dependencies and licences

Runtime: `react`, `react-dom` (MIT), `zod` (MIT). Build and test: `typescript` (Apache-2.0),
`vite` (MIT), `vitest` (MIT), `fast-check` (MIT), `eslint` and plugins (MIT). No GPL or AGPL
dependency. The collector needs nothing beyond Node and `git`. The full list is in
`pnpm-lock.yaml`.

## Pre-existing code

Every line of application code in this repository was written during the submission period
(repository created on 11 November 2026). The CI scaffolding under `.github/` and `.mergify.yml`
is adapted from the author's own open-source pipeline used in other repositories; it contains no
application code.

## Licence

MIT — see [LICENSE](LICENSE).
