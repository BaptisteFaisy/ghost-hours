# ADR-0002 — A meeting trims only the sessions of *another* client

**Status:** Accepted — corrected in `8f2c0d3` (2026-11-11), recorded 2026-11-12.

## Context

D.5 step 7 says a meeting, whose bounds are *known*, wins over an assumed
lead-in, which is *invented* (`packages/sessionizer/src/algorithm.ts:43-45`,
principle 4; `packages/sessionizer/src/blocks.ts:95-100`, the doc of
`trimSession`). The sessionizer places every clean meeting in an `occupied`
list first, then trims every session that overlaps it.

## What went wrong

The pre-fix `occupied` list did not carry the client of the meeting, and the
trim filtered on overlap alone (`git show 8f2c0d3 -- packages/sessionizer/src/algorithm.ts`,
removed line `const removals = occupied.filter((span) => overlaps(…))`). A
meeting of the **same client** as the session was therefore cut out of that
session. When the meeting sat on the morning's assumed lead-in, the lead-in —
the first half-hour of the day — was trimmed away and lost: the narrative in
`docs/SUBMISSION.md:145-146` says exactly that ("A session was trimmed by its
own client's meeting, losing the first half-hour of the day"). The example-based
tests passed: they either used a meeting of another client
(`packages/sessionizer/src/sessionize.test.ts:105`) or a meeting touching a
session with no lead-in at stake
(`packages/sessionizer/src/sessionize.test.ts:134`).

## Decision

**Only another client's meeting may trim a session. A meeting of the same client
is merged with the session, not cut out of it** — step 8 (`mergeSameClient`)
already handles same-client touching spans; step 7 must not pre-empt it.

The rule is implemented as data, not as a comment: every `occupied` entry
carries its `clientId`, and the trim filters
`entry.clientId !== session.clientId`
(`packages/sessionizer/src/algorithm.ts:285-301`).

## Consequences

- A session keeps its assumed lead-in when its own client's meeting overlaps
  it; the meeting and the session become one block via `mergeSameClient`
  (`packages/sessionizer/src/blocks.ts:140-141`).
- Cross-client trimming is unchanged: a foreign meeting still wins over an
  assumed lead-in, and a proof inside a foreign meeting is still a
  contradiction, never a trim (`packages/sessionizer/src/blocks.ts:95-100`).
- Wording drift to fix: the principle summary at
  `packages/sessionizer/src/algorithm.ts:43-45` still reads "A meeting trims an
  assumed lead-in" without the client condition; the narrowed rule lives in
  `trimNonConflicting` (`:285-287`).

## Proof

- **The fix, file:line** — `packages/sessionizer/src/algorithm.ts:285-291`
  (comment "Only another client's meeting may trim a session — a meeting of the
  same client is merged with it, not cut out of it"; `occupied` entries carry
  `clientId`) and `:298-301` (filter `entry.clientId !== session.clientId`);
  `:305-308` (what a session keeps is re-claimed under its own client).
- **Before/after** — `git show 8f2c0d3 -- packages/sessionizer/src/algorithm.ts`
  (commit "mois fictif de démonstration + trois correctifs du sessionizer").
- **Regression tests** —
  `packages/sessionizer/src/sessionize.test.ts:134` *"merges a meeting and a
  session of the same client that touch"* (same-client span is merged, not
  cut); `packages/sessionizer/src/sessionize.test.ts:105` *"trims a session of
  another client with a meeting"* (cross-client trim kept);
  `packages/sessionizer/src/properties.test.ts:127-155` *HEU-P-04 — adding a
  proof never lowers the proven time* (per client — the invariant a lost
  lead-in breaks); `fixtures/sample-month/sample-month.test.ts:71-76`
  *"reconstructs each client to the announced hours"*.
- **Narrative source** — `docs/SUBMISSION.md:88-90`, `:144-146`. Shrunk
  counterexample/seed: *not found in the code* (README, "What the code proves,
  and what only the narrative claims").
