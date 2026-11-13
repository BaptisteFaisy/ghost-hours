# Tasks — `sessionizer`

Ordered by dependency, smallest verifiable steps. Tick only after the command has run green.

## 1. Skeleton

- [ ] 1.1 Barrel `packages/sessionizer/src/index.ts`; remove the placeholder export.
      Verify: `pnpm tsc --noEmit -p packages/sessionizer/tsconfig.json`.
- [ ] 1.2 `types.ts`: `Session`, `StartContext`, `CalibrationProposal`, `ReconstructInput`
      (reusing core's `Block`, `Conflict`, `Evidence`, `ReconstructionSettings`).
- [ ] 1.3 `arbitraries.ts`: `arbEvidence`, `arbSettings`, `arbLockedBlocks`.

## 2. Normalisation and sessions (HEU-F-11)

- [ ] 2.1 `normalize.ts`: sort by `(at ?? start, id)`, split point vs span evidence, drop
      client-less evidence into `orphans`. Verify: `normalize.test.ts`.
- [ ] 2.2 `sessions.ts`: cut on `gap > gapMaxMinutes` (strict), per client, drop below
      `minSessionMinutes`. Verify: `sessions.test.ts` with the 14:02/14:40/16:38/18:20 case.
- [ ] 2.3 Test the exact-boundary case: a 90-minute gap with `gapMax = 90` stays in one session.

## 3. Session start (HEU-F-12, HEU-P-07)

- [ ] 3.1 `start.ts`: checkout within `leadInMax`, later than the previous evidence of any client.
      Verify: `start.test.ts` — the 13:51 checkout case.
- [ ] 3.2 Fallback: first evidence minus `leadInDefault`, clamped by the previous evidence and by
      `workdayStart` on that day **in `settings.timeZone`**.
      Verify: the 07:10 → 07:00 case, and the same case in `Asia/Tokyo`.
- [ ] 3.3 Property **HEU-P-07**: `it('HEU-P-07 an assumed start never precedes the previous
      evidence nor the workday start')`, `{ seed: 20261107, numRuns: 300 }`.
- [ ] 3.4 Test `assumedLeadInMinutes === 0` when the clamp leaves no room.

## 4. Ends and meetings (HEU-F-13)

- [ ] 4.1 `ends.ts`: last evidence + `tailMinutes`, floored at `start + minSession`.
      Verify: `ends.test.ts` including `tail = 0`.
- [ ] 4.2 `meetings.ts`: one exact block per meeting, `provenShare: 1`, `assumedLeadInMinutes: 0`.
      Verify: `meetings.test.ts`.
- [ ] 4.3 Same-client overlapping meetings merge into one `origin: 'merged'` block.

## 5. Overlaps and conflicts (HEU-F-14)

- [ ] 5.1 `overlaps.ts`: cross-client trim/split of Git sessions around meetings.
      Verify: the 09:00–12:00 Globex / 11:00–11:30 Acme case → two blocks, no overlap.
- [ ] 5.2 Contradiction path: commits inside another client's meeting → `Conflict` with both sides
      intact, ids from `conflictId`. Verify: the Northwind commits case.
- [ ] 5.3 Property **HEU-P-01** re-asserted on the output: no pair of blocks overlaps,
      `{ seed: 20261101 }`.
- [ ] 5.4 Test that a resolved conflict is applied and kept with `resolved: true`.

## 6. Merge and confidence (HEU-F-15)

- [ ] 6.1 `merge.ts`: meeting + same-client Git session touching → one block, evidence ids sorted.
      Verify: `merge.test.ts`.
- [ ] 6.2 `confidence.ts`: `provenShare` via `coveredMs` from `@ghost-hours/intervals`, thresholds
      0.8 / 0.5. Verify: the 13:45–16:40 / 14:02–16:40 case → 0.90, `solid`, assumed 17.
- [ ] 6.3 Test the three levels explicitly (0.9, 0.6, 0.3) and the exact boundaries 0.8 and 0.5.

## 7. Determinism (HEU-F-16, HEU-P-03)

- [ ] 7.1 `reconstruct.ts`: the fold over all steps, returning `ReconstructionResult` with sorted
      `blocks`, `conflicts`, `orphanEvidence`, `settings`.
      Verify: `reconstruct.test.ts` on a small fixture.
- [ ] 7.2 Property **HEU-P-03**: shuffled evidence gives identical blocks,
      `{ seed: 20261103, numRuns: 150 }`.
- [ ] 7.3 `grep -rn 'Object.keys\|for (const .* in ' packages/sessionizer/src` finds no iteration
      that could affect output order. Verify: grep output in the notes.

## 8. Remaining properties (P-04, P-05, P-06)

- [ ] 8.1 **HEU-P-04**: adding one evidence never decreases total proven duration,
      `{ seed: 20261104 }`.
- [ ] 8.2 **HEU-P-05**: every client-assigned evidence id is in a block, a conflict or
      `orphanEvidence`, `{ seed: 20261105 }`.
- [ ] 8.3 **HEU-P-06**: every non-manual block has at least one evidence id, `{ seed: 20261106 }`.

## 9. Locked blocks and calibration (HEU-P-13, HEU-F-17)

- [ ] 9.1 `locked.ts`: insert locked blocks as occupied ranges before overlap resolution; attach new
      evidence inside them instead of creating an overlapping block.
      Verify: `locked.test.ts` — the locked 14:00–17:00 case.
- [ ] 9.2 Property **HEU-P-13**: locked blocks are byte identical after a new reconstruction,
      `{ seed: 20261113 }`.
- [ ] 9.3 `calibration.ts`: `proposeCalibration` returns the median, `ready` at 10 observations, and
      never mutates settings. Verify: the ten-value median case (27.5).

## 10. Finish

- [ ] 10.1 Performance check: 5 000 commits + 2 000 meetings under 2 s (HEU-N-03); record the real
      number in `KIRO_JOURNAL.md`, or `TODO(measure)` if the fixture is not ready.
- [ ] 10.2 `pnpm vitest run packages/sessionizer && pnpm lint && pnpm typecheck` green.
- [ ] 10.3 Ask the `time-reviewer` agent to re-read `start.ts` and `ends.ts` against
      `steering/time.md`; record its findings in the journal.
