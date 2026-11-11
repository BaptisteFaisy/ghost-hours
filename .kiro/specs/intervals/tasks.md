# Tasks — `intervals`

Ordered by dependency; each task names the command or test that proves it. Do not tick a box until
the command has been run and is green.

## 1. Skeleton

- [ ] 1.1 Replace the placeholder `packages/intervals/src/index.ts` with a barrel exporting the
      modules below, one `export * from './x.ts';` per line.
      Verify: `pnpm tsc --noEmit -p packages/intervals/tsconfig.json`.
- [ ] 1.2 Add `arbitraries.ts` with `arbInstant`, `arbRange`, `arbRanges` (fixed bounds so failures
      are readable). Verify: typecheck; not a `.test.ts` file.

## 2. The range primitive

- [ ] 2.1 `range.ts`: `range()` (returns `null` when `end <= start`), `duration`, `isEmpty`,
      `overlaps`, `touches`, `contains`, `clipTo`.
      Verify: `range.test.ts` covers touching (not overlapping), identical, contained, clipped.
- [ ] 2.2 Test `clipTo` on a range entirely outside the bounds returns `null`, and on a partial
      overlap returns the inside part only.

## 3. Normalisation (the core algorithm)

- [ ] 3.1 `normalize.ts`: sort by `(start, end)`, single pass merge, drop empty.
      Verify: `normalize.test.ts`.
- [ ] 3.2 Test the three shapes: disjoint (unchanged), overlapping (merged), touching (merged),
      nested (outer wins), inverted (dropped), empty array (`[]`).
- [ ] 3.3 Property **HEU-P-01**: `it('HEU-P-01 normalized ranges never overlap')` with
      `{ seed: 20261101, numRuns: 300 }`, asserting sortedness, pairwise
      `ranges[i].end <= ranges[j].start`, and duration preservation against `union`.
      Verify: `pnpm vitest run packages/intervals`.
- [ ] 3.4 Idempotence test: `normalize(normalize(x))` deep-equals `normalize(x)`.

## 4. Set algebra

- [ ] 4.1 `union.ts` as `normalize([...a, ...b])`. Verify: `union.test.ts` (disjoint, nested,
      identical).
- [ ] 4.2 `intersection.ts`: normalise both, two-cursor walk. Verify: `intersection.test.ts`
      including disjoint → `[]`.
- [ ] 4.3 `difference.ts`: cursor over normalised `b` per range of `a`. Verify:
      `difference.test.ts` — left piece, right piece, split in the middle, full cover → `[]`.
- [ ] 4.4 Identity test: `dur(diff) + dur(inter) === dur(union)` on generated input.

## 5. Splitting and coverage

- [ ] 5.1 `split.ts`: `splitAt(range, points)` (ignore points outside, sort points, no zero-length
      piece) and `gaps(day, ranges)` as `difference([day], ranges)`. Verify: `split.test.ts`.
- [ ] 5.2 `coverage.ts`: `coveredMs`, `provenShare`. Verify: `coverage.test.ts` with the 13:45–16:40
      / 14:02–16:40 example (158/175 ≈ 0.90).
- [ ] 5.3 Property **HEU-P-02**: `it('HEU-P-02 day total equals the union and never exceeds the
      day')` — clip generated ranges to a day, assert `sum(duration) === duration(union)` and
      `<= duration(day)`, `{ seed: 20261102 }`. Verify: test green.
- [ ] 5.4 Test `provenShare` is always in `[0, 1]` on generated input.

## 6. Finish

- [ ] 6.1 No `Date`, no `timeZone`, no `import` from outside `@ghost-hours/core`:
      `grep -n 'Date\|timeZone' packages/intervals/src/*.ts` returns nothing (except in comments).
      Verify: the grep output pasted in the task notes.
- [ ] 6.2 `pnpm vitest run packages/intervals && pnpm lint && pnpm typecheck` green.
- [ ] 6.3 Record in `KIRO_JOURNAL.md` the "spec vs vibe coding" comparison for `normalize`
      (duration both ways, round trips, defects found). Until measured: `TODO(measure)`.

## 7. Integration points

- [ ] 7.1 `sessionizer` uses `normalize` + `difference` instead of its own loops; delete any
      duplicate loop it had. Verify: `grep -c 'for (' packages/sessionizer/src` decreases, tests
      still green.
- [ ] 7.2 `billing` uses `duration` and `intersection`; no local duration helper.
      Verify: `grep -rn 'end - start' packages/billing/src` finds nothing.
