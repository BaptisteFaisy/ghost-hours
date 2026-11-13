# Tasks — `billing`

Ordered by dependency. Tick only after the command has run green.

## 1. Skeleton and rounding (rounding first: everything depends on it)

- [ ] 1.1 Barrel `packages/billing/src/index.ts`; remove the placeholder export.
      Verify: `pnpm tsc --noEmit -p packages/billing/tsconfig.json`.
- [ ] 1.2 `rounding.ts`: `roundMinutes` with the three modes, `m === 0 → 0`, ties up for `nearest`.
      Verify: `rounding.test.ts` — 13 → 15, 7 → 0, 61 up → 75.
- [ ] 1.3 `roundByScope`: `session`, `day`, `total` over `{ key, minutes }[]` entries.
      Verify: one test showing the three scopes give three different totals on the same input.
- [ ] 1.4 Property **HEU-P-08**: `it('HEU-P-08 rounding up never shrinks and rounding twice is
      stable')` with `{ seed: 20261108, numRuns: 300 }`.
- [ ] 1.5 `arbitraries.ts`: `arbRounding`, `arbBlock`, `arbClient`, `arbConfirmedBlocks`.

## 2. Day splitting (before any mode)

- [ ] 2.1 Split a block at day boundaries using `dayRangeInZone` from core, keyed by
      `dayKeyInZone(block.start, settings.timeZone)`.
      Verify: `days.test.ts` — 23:30–00:30 gives 30 minutes on each day.
- [ ] 2.2 Test a DST day (25 October 2026): the day's length is 25 h and the split is still correct.
- [ ] 2.3 `grep -n 'toISOString\|slice(0, 10)' packages/billing/src` returns nothing.

## 3. Modes

- [ ] 3.1 `modes.ts`: `hourlyAmountCents` (`round(minutes * rateCents / 60)`, once per line).
      Verify: `modes.test.ts` — 570 min at €65/h = 61 750 cents.
- [ ] 3.2 `thresholdQuantity`: 1 at ≥ 360, 0.5 at ≥ 150, else 0, using `settings`.
      Verify: the 400 / 200 / 60 minute case → 1 / 0.5 / 0.
- [ ] 3.3 Property **HEU-P-10**: `it('HEU-P-10 a threshold day is worth 0, 0.5 or 1')`,
      `{ seed: 20261110 }`.
- [ ] 3.4 `proportionalQuantity`: `min(dayMinutes / dayLength, 1)`, test 600/420 → 1.

## 4. Caps and warnings

- [ ] 4.1 `caps.ts`: cap a day per client at one day; collect cross-client day totals.
      Verify: `caps.test.ts`.
- [ ] 4.2 Emit a warning when a day exceeds `dayLengthMinutes` across clients (the 300 + 300 case).
- [ ] 4.3 Test that capped minutes are named in `roundingNote`, not silently dropped.

## 5. The draft

- [ ] 5.1 `draft.ts`: filter `status ∈ {confirmed, locked}`, split days, group by project, apply
      rounding scope, cap, build lines. Verify: `draft.test.ts` on a small fixture.
- [ ] 5.2 `draftLabel: 'Draft'`, no number field anywhere in the type. Verify:
      `grep -rn 'number\|invoiceNo' packages/billing/src/draft.ts` shows no such field.
- [ ] 5.3 Tax: `round(subtotal * bp / 10_000)`, `total = subtotal + tax`, 0 by default.
      Verify: the 100 000 / 2000 bp case → 20 000 / 120 000.
- [ ] 5.4 Property **HEU-P-09**: `it('HEU-P-09 the total is the sum of the lines')`,
      `{ seed: 20261109 }`, plus a per-line recomputation check.
- [ ] 5.5 Empty period: zero lines, no error. Verify: explicit test.

## 6. Locking (HEU-F-29)

- [ ] 6.1 `lock.ts`: `markPeriodBilled(blocks, period, clientId)` → `status: 'locked'`,
      `locked: true`, immutable copy. Verify: `lock.test.ts`.
- [ ] 6.2 Test that a locked period's draft total does not change when new blocks are added.
- [ ] 6.3 Test that non-matching clients and periods are untouched.

## 7. Annex (HEU-F-26)

- [ ] 7.1 `annex.ts`: one `AnnexDay` per day, sorted by `dayKey`, `minutes` from confirmed blocks.
      Verify: `annex.test.ts`.
- [ ] 7.2 `detail: 'durations'` leaves `commitCount: 0` and `meetingTitles: []`; `with-evidence`
      fills them. Verify: two tests on the same input.
- [ ] 7.3 Test that no commit subject can reach the annex (only counts and meeting titles).

## 8. Exports (HEU-F-27)

- [ ] 8.1 `exports.ts`: `timesheetCsv` via `toCsv`/`csvCell` from core, header + one row per block.
      Verify: `exports.test.ts` — a value containing `;` and a newline is quoted correctly.
- [ ] 8.2 `datasetJson`: build a `Dataset` with `buildDataset` and serialise; round trip through
      `parseDataset` deep-equals. Verify: test.
- [ ] 8.3 The print path is a stylesheet in `apps/web`, not a library here: assert that
      `packages/billing` has no PDF dependency. Verify: `grep -rn 'pdf' packages/billing` finds
      nothing.

## 9. Finish

- [ ] 9.1 `grep -rn 'toFixed\|parseFloat\|Intl.NumberFormat' packages/billing/src` returns nothing.
- [ ] 9.2 `pnpm vitest run packages/billing && pnpm lint && pnpm typecheck` green.
- [ ] 9.3 Ask the `prudence-reviewer` agent to re-read `draft.ts` against `steering/prudence.md`
      (can any path bill a non-confirmed block?). Record its answer in the journal.
- [ ] 9.4 Deferred, not in this spec: HEU-F-28 Factur-X hybrid PDF (priority O). Do not start it
      without a decision.
