# ADR-0003 — A contradiction is never merged away

**Status:** Accepted — corrected in `8f2c0d3` (2026-11-11), recorded 2026-11-12.

## Context

When two exact proofs disagree — a commit inside another client's meeting, or
two meetings of different clients overlapping — the sessionizer raises a
contradiction and refuses to choose (`packages/sessionizer/src/algorithm.ts:41-42`,
principle 3; detection at `:248-267`). The blocks it touches must reach the
user with `status: 'conflict'`, because only the human can arbitrate. Step 8
then merges same-client drafts that touch (`mergeSameClient`,
`packages/sessionizer/src/blocks.ts:140-141`).

## What went wrong

Before the fix, merging ran over **all** drafts, conflicted ones included:
`mergeSameClient([...trimmed.drafts, ...meetingDrafts, ...manualDrafts])`
(`git show 8f2c0d3 -- packages/sessionizer/src/algorithm.ts`, removed line). A
conflicted draft swallowed by a neighbour changed identity: its `draftKey` —
`blockId(start, end, clientId, origin)` — was no longer in `conflictBlockKeys`,
so `finalise` labelled the merged block `'proposed'` (old status expression in
the same diff). The conflict silently vanished *and* the resulting proposed
block overlapped another client's block — the exact thing `HEU-P-01` forbids
(`docs/SUBMISSION.md:146-147`). A unit test asserting "a conflict is raised"
still passed: the conflict *was* raised, then absorbed one step later.

## Decision

**A contradiction keeps its own block, whatever happens around it.** Four
mechanisms, in pipeline order:

1. **Drafts carry the flag** — `BlockDraft.conflicted` and
   `BlockDraft.constituents` (`packages/sessionizer/src/types.ts:42-45`).
2. **Conflicted drafts are excluded from the merge**, then re-added
   (`packages/sessionizer/src/algorithm.ts:119-128`, comment "A contradiction
   is never merged away: it keeps its own block, and the work around it is cut
   around the contradiction"). When a merge nevertheless happens, the flag and
   the constituent keys propagate (`packages/sessionizer/src/blocks.ts:165-168`).
3. **A final overlap pass places contradictions first and cuts the work around
   them** — `removeOverlaps`, documented as "Last line of defence for
   `HEU-P-01`" (`packages/sessionizer/src/blocks.ts:180-223`); conflicted
   drafts are left untouched (`:194-204`) because "overlapping is exactly what
   the user has to arbitrate" (`:184-186`).
4. **A conflict always points at a real block id** — `constituentIndex` maps
   every merged-away key to the block that kept it
   (`packages/sessionizer/src/algorithm.ts:332-341`), and `buildConflicts`
   resolves through it (`:343-364`). `finalise` sets `status: 'conflict'` from
   the flag itself (`packages/sessionizer/src/blocks.ts:293`).

## Consequences

- The conflict screen shows both sides and the user arbitrates — keep, reject,
  or share the minutes (`e2e/smoke.spec.ts:85-96`; the demo month plants one
  contradiction on 16 November, `fixtures/sample-month/README.md:28-33`).
- The work around a conflict is not lost: it is cut into pieces that stay
  billable, and every evidence id that no piece holds lands in the leftovers
  (`packages/sessionizer/src/blocks.ts:218-219`, "Nothing may vanish").
- `HEU-P-01` must exempt `status: 'conflict'` blocks from the no-overlap
  assertion — a deliberate, documented exemption
  (`packages/sessionizer/src/properties.test.ts:59-61`).

## Proof

- **The fix, file:line** — `packages/sessionizer/src/algorithm.ts:119-128`,
  `:332-364`; `packages/sessionizer/src/blocks.ts:165-168`, `:180-223`, `:293`;
  `packages/sessionizer/src/types.ts:42-45`.
- **Before/after** — `git show 8f2c0d3 -- packages/sessionizer/`.
- **Regression tests** — `packages/sessionizer/src/properties.test.ts:55-74`
  *HEU-P-01 — no two blocks ever overlap* (the property the absorbed conflict
  broke); `packages/sessionizer/src/sessionize.test.ts:122` *"raises a conflict
  when a proof falls inside another client meeting"*;
  `fixtures/sample-month/sample-month.test.ts:86-91` *"contains a contradiction
  and a block that is not proven"* (`conflictCount: 2`,
  `fixtures/sample-month/expected.json`) and `:93-99` *"never overlaps two
  blocks the user could confirm"*; `e2e/smoke.spec.ts:85-96` *"requirement 3b —
  the contradiction of the month is on screen"*.
- **Narrative source** — `docs/SUBMISSION.md:88-90`, `:146-147`. Shrunk
  counterexample/seed: *not found in the code* (README, "What the code proves,
  and what only the narrative claims").
