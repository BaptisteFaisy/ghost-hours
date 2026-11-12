# ADR-0004 — The proven share is computed per block, never per client

**Status:** Accepted — corrected in `8f2c0d3` (2026-11-11), recorded 2026-11-12.

## Context

Every block is graded by the share of its span that is *proven* — intervals
between its own consecutive proofs, plus the spans of the meetings it contains
(`.kiro/specs/sessionizer/design.md:150-153`). The share drives the confidence
label (`solid` ≥ 0.8, `likely` ≥ 0.5, `to-confirm` below —
`packages/sessionizer/src/blocks.ts:308-315`) that the reviewer sees before
confirming a block for an invoice.

## What went wrong

The spec says "between consecutive evidence **of the block**"; the code indexed
proof **per client, over the whole month**. `proofIndex` pooled every point of
a client, and `proofIntervals` spans each pair of consecutive points
(`packages/sessionizer/src/blocks.ts:71-82`) — so the gap between Monday's last
commit and Tuesday's first one, i.e. **the night**, became a proof interval.
`finalise` then looked the pool up by `draft.clientId` and `provenShareOf`
clamped it to the block (`packages/sessionizer/src/blocks.ts:243-254`): the
night interval, clamped to Tuesday morning, covered it entirely. The morning
looked 100 % proven although nothing happened inside it
(`docs/SUBMISSION.md:147-149`: "the night between two working days made the
next morning look proven"). Unit tests computed shares for single blocks in
isolation and never built a two-day client, so they passed.

## Decision

**Proof is computed per block, from the block's own evidence only. The gap
between two blocks is never proof — a night is not work.**

`proofOfDraft` collects the point proofs and meeting spans that the block's own
`evidenceIds` reference, and only those
(`packages/sessionizer/src/algorithm.ts:313-330`, doc comment `:313-317`). The
index handed to `finalise` is keyed by `draftKey`, not by client
(`packages/sessionizer/src/algorithm.ts:129-130`;
`packages/sessionizer/src/blocks.ts:256-262`, `:284-286`). The formula of the
spec was already right; the code now matches it.

## Consequences

- A block is only as proven as its own evidence: an assumed lead-in stays
  assumed, and blocks that lean on it are graded *to-confirm* instead of
  *solid*. The demo month shows it: 3 blocks are not `solid`, among them the
  45-minute hotfix of 11 November with its 30-minute assumed lead-in
  (`fixtures/sample-month/expected.json` `unprovenBlocks: 3`;
  `fixtures/sample-month/README.md:34-36`).
- Confidence labels — and through them what a user dares put on an invoice —
  can no longer be inflated by an unrelated proof the same client emitted the
  day before. This is the "prudence" steering made mechanical.
- Manual entries are unaffected: they keep a proven share of 0 by rule
  (`packages/sessionizer/src/blocks.ts:286`,
  `packages/sessionizer/src/algorithm.ts:47-48`).

## Proof

- **The fix, file:line** — `packages/sessionizer/src/algorithm.ts:313-330`
  (`proofOfDraft`, comment "The gap between two blocks is never proof — a night
  is not work"), `:129-130` (per-draft index);
  `packages/sessionizer/src/blocks.ts:258-259` (`FinaliseInput.proofByDraft`,
  "keyed by `draftKey`"), `:284-286` (`finalise` reads `proofByDraft.get(key)`).
- **Before/after** — `git show 8f2c0d3 -- packages/sessionizer/src/algorithm.ts`
  shows the removed `proofIndex(points, meetingDrafts)` keyed by `clientId`,
  and `-- packages/sessionizer/src/blocks.ts` the removed
  `input.proofByClient.get(draft.clientId)`.
- **Regression tests** — `fixtures/sample-month/sample-month.test.ts:86-91`
  *"contains a contradiction and a block that is not proven"* (asserts
  `unprovenBlocks: 3` through the real pipeline — with the night bug every
  block would look `solid`); `packages/sessionizer/src/sessionize.test.ts:181`
  *"grades confidence from the proven share"*;
  `packages/sessionizer/src/properties.test.ts:127-155` *HEU-P-04 — adding a
  proof never lowers the proven time* (the monotonicity the per-client pool
  also disturbed).
- **Narrative source** — `docs/SUBMISSION.md:88-90`, `:147-149`. Shrunk
  counterexample/seed: *not found in the code* (README, "What the code proves,
  and what only the narrative claims").
