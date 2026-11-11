# Testing instructions for the judges

**App:** <https://baptistefaisy.github.io/ghost-hours/> — static site, no account, no server, no
network call after the page loads. Works in a private window.
**Repo:** <https://github.com/BaptisteFaisy/ghost-hours> (MIT).

Open the URL. The empty state offers one button: **Load the sample month** (HEU-F-30). Click it.
It loads a fictitious November 2026 for a fictitious freelancer, Sofia Marquez
(`sofia@example.com`), with three fictitious clients — Acme (hourly, €65/h), Northwind (daily by
thresholds, €520/day), Globex (daily proportional, €480/day). Everything below is reachable from
the six tabs, in this order: **Month → Week → Evidence → Clients → Invoice → Settings**.

## The exact numbers to expect

The sample month is a dataset with asserted output, not a mock-up. After loading it:

| Figure | Expected | Where it is asserted |
|---|---|---|
| Found hours | **104 h** | `fixtures/sample-month/expected.json` (6 240 min), recomputed through the real pipeline by `fixtures/sample-month/sample-month.test.ts` |
| Declared hours | **92 h** | same file (5 520 min) |
| Ghost hours | **12 h** | same file (720 min) |
| Ghost amount | **€780.00** | same file (78 000 cents); `apps/web/src/screens/Month.test.tsx` asserts the rendered `€780.00` |
| Blocks | **20**, of which **2** marked *Conflict* and **3** graded not-solid | `expected.json` (`blockCount`, `conflictCount`, `unprovenBlocks`) |
| Conflicts | **1 contradiction** on Monday 16 November, shown as the two conflicting blocks | `fixtures/sample-month/README.md` |

The numbers cannot drift from the product: the acceptance test recomputes them on every `pnpm test`.

## What each screen proves

1. **Month** (HEU-F-21, HEU-F-22) — the ghost-hours counter: *Found hours 104 h, Declared hours
   92 h, Ghost hours 12 h, Ghost amount €780.00*, plus the load of each day and the per-client
   breakdown (Acme 62 h found / 50 declared / 12 ghost; Northwind 26/26/0; Globex 16/16/0). The
   declared hours are editable: change Acme from 50 to 55 and the counter announces 7 ghost hours
   and €455.00 immediately.
2. **Week** (HEU-F-18, HEU-F-19) — the review grid. Proposed blocks are translucent ghosts with a
   dashed border; confirmed blocks are solid; conflicts are hatched; inside a block, the assumed
   lead-in is paler than the proven part. Gestures on every block: **Confirm**, **Reject**,
   **Adjust** (± step on each edge), **Split**, **Change client**; plus **Confirm the day** and
   **Confirm the week**. A keyboard-operable equivalent table sits under the grid (HEU-N-04).
3. **Evidence** (HEU-F-20) — select a block (click it in the grid) and the panel lists every proof
   behind it — commits, reflog checkouts, meetings, notes — on a stitched seam with one glyph per
   source, with the proven share against the assumed share, and the confidence grade (*Solid*,
   *Likely*, *To confirm*). Try the 45-minute hotfix session of 11 November: two commits plus a
   30-minute assumed lead-in keep its proven share low, so it is graded *To confirm*.
4. **Clients** (HEU-F-07…09) — the three clients with their billing mode, rate, rounding rule and
   projects, and the mapping rules that attach evidence (repository, remote fragment, attendee
   domain, note tag). Evidence with no client lands in the orphan list with heuristic candidates;
   accepting one creates the rule in a single gesture and the reconstruction re-runs. No model, no
   network — the suggestion is pure heuristics (`packages/mapping/src/candidates.ts`).
5. **Invoice** (HEU-F-23…27, HEU-F-29) — see the draft section below.
6. **Settings** (D.11) — the reconstruction parameters (gap max 90, default lead-in 30, lead-in
   max 120, min session 15, tail 0, day length 420, full day from 360, half day from 150) and the
   IANA time zone (`Europe/Paris`); every change re-runs the reconstruction live. The **Language**
   select switches the whole interface to **Français** (HEU-N-05) — English is the default.
   **Load the sample month** reloads the fixture; **Erase all data** clears the browser storage.

## The conflict of 16 November, and how to settle it

In the Week tab the default week is 2–8 November. Click **Next week →** twice to reach
**16–22 November**. On Monday 16, Sofia committed to `acme-api` at 11:20 and 11:45 while her
calendar holds the *Northwind architecture review* from 11:00 to 12:00. Two exact proofs
contradict each other, so the tool refuses to choose (HEU-F-14): the Acme session and the
Northwind meeting are both hatched as *Conflict*, and the **Resolve conflict** card states the
reason, the time span, and the proofs in cause. Each side has a keep button labelled with the
client and the block's start time (the Northwind side reads `Northwind · 11:00`): clicking one
**confirms that block and rejects the other**, and the conflict is marked resolved. The rest of the Northwind day is cut around the meeting and stays billable.

## The invoice draft

The draft is computed from **confirmed blocks only** (HEU-F-23), so on a fresh load the Invoice
tab says *No confirmed work in this period.* To see it filled: go to **Week**, click **Confirm the
week**, then reopen **Invoice**. What to check:

- the **Draft** label and the notice *This is a draft, not a legal invoice: it carries no invoice
  number* — there is no number anywhere (HEU-F-25);
- the lines per project with quantity, unit price and amount; subtotal, freely entered tax rate,
  grand total; the **written rounding rule** of the client (nearest 15 min, per day, for Acme);
- the **evidence annex**, day by day (HEU-F-26), with the detail level set to durations only or
  durations with evidence (commit counts and meeting titles);
- the exports (HEU-F-27): **Export the timesheet (CSV)**, **Export the data (JSON)** and **Print
  the draft** (browser print of a self-contained HTML draft, which is how the PDF is produced);
- **Mark the period invoiced** (HEU-F-29): the client's blocks of the month turn *locked* and any
  later reconstruction returns them untouched (property HEU-P-13).

## No network — verify it yourself

Open DevTools → **Network** and reload: the only requests are the static assets served by
`baptistefaisy.github.io` during the load. Then click everything — load the sample month, confirm
blocks, settle the conflict, export, switch to French: **no new request appears** (HEU-N-01). The
rule is enforced in CI by `scripts/check-no-network.mjs` (no `fetch`, XHR, WebSocket or remote
`<script>` in `packages/` or `apps/`). Data lives in IndexedDB (localStorage fallback) and
**Erase all data** removes it.

## Run it locally, and the read-only Git collector

```bash
git clone https://github.com/BaptisteFaisy/ghost-hours.git && cd ghost-hours
pnpm install && pnpm dev        # http://localhost:5173 — Node 22+, pnpm 9
pnpm test                       # unit tests + the 14 fast-check properties HEU-P-01…HEU-P-14
```

The collector is a CLI that reads Git history — one author's commits across **all references**,
plus the reflog — and writes `evidence.json`. It never writes to a repository, and that is a test,
not a promise (`packages/collector/src/readonly.test.ts`: every file byte-identical, HEAD, branch
and status fingerprint unchanged):

```bash
pnpm --filter @ghost-hours/collector build
node packages/collector/bin/ghost-hours.mjs collect ~/code \
  --author you@example.com --since 2026-11-01 --out evidence.json
```

`--no-summaries` skips commit messages entirely; `--dry-run` reports without writing;
`--help` lists every flag.

## Where the Kiro work is

`.kiro/` is tracked at the root of the repository (a CI guard, `scripts/check-kiro-tracked.mjs`,
refuses any attempt to gitignore it). It holds: **10 steering files** (6 `always`, 3 `fileMatch`,
1 `manual`), **6 specs** (`collector`, `ics-import`, `intervals`, `sessionizer`, `billing`,
`review-ui`) with EARS requirements carrying the `HEU-F-nn` identifiers, **5 hook files** (five
`command` actions that cost no credits, one `agent` action), **3 custom agents** (two read-only
reviewers, one restricted property-tester) and **2 skills** (`sample-month`, `property-hunt`).
[`KIRO_JOURNAL.md`](../KIRO_JOURNAL.md) answers the eight questions of the submission form as the
work happened; anything not measured yet is written `TODO(measure)` there rather than invented.
[`docs/ACCEPTANCE.md`](ACCEPTANCE.md) maps the specification's acceptance checklist (D.17) to the
test that proves each line, and every Kiro hook guard is doubled in CI by
`scripts/check-privacy.mjs`, `scripts/check-no-network.mjs` and `scripts/check-kiro-tracked.mjs`.
