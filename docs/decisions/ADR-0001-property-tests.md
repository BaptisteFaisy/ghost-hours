# ADR-0001 — The fast-check properties are a first-class guard

**Status:** Accepted — decision taken 2026-11-11 (`f40aa94`), recorded 2026-11-12.

## Context

Every minute that reaches an invoice in Ghost Hours comes out of a heuristic:
sessions are cut on a gap, lead-ins are *assumed* before the first proof,
meetings trim what is only assumed, and blocks that touch are merged. Unit tests
pick one example each and assert the example. They passed, and the heuristics
were still wrong in three ways (ADR-0002 to ADR-0004).

The specification therefore states its invariants as **fourteen named
properties**, `HEU-P-01` … `HEU-P-14`, each owned by the package that can break
it:

- sessionizer: `HEU-P-01`…`HEU-P-07`, `HEU-P-13`, `HEU-P-14` —
  `packages/sessionizer/src/properties.test.ts:55-225`;
- billing: `HEU-P-08`…`HEU-P-10` — `packages/billing/src/properties.test.ts:18-23`;
- ics: `HEU-P-11`, `HEU-P-12` — `packages/ics/src/properties.test.ts:87`, `:155`;
- intervals: the algebraic basis of `HEU-P-01`…`HEU-P-04` —
  `packages/intervals/src/properties.test.ts:41-96`;
- order independence and idempotence are re-asserted where they can break:
  `packages/mapping/src/properties.test.ts:36`, `packages/notes/src/properties.test.ts:32`,
  `packages/collector/src/idempotence.test.ts:28`.

The property table is part of the spec itself
(`.kiro/specs/sessionizer/design.md:181-190`), not an afterthought of the test
suite.

## Decision

1. **A property carries the identifier of the requirement it protects.** A red
   test names a broken promise (`HEU-P-01 — no two blocks ever overlap`), not a
   broken example.
2. **A property failure is a build failure**, with the same status as a type
   error: the whole suite runs in CI (`.github/workflows/ci.yml:65-69`,
   `pnpm test`).
3. **The two packages where a minute can be stolen run their properties on
   save**, not at the next CI run: the hook `interval-properties`
   (`.kiro/hooks/interval-properties.json`) runs
   `pnpm vitest run packages/intervals packages/sessionizer` after any edit
   under `packages/(intervals|sessionizer)/.*\.ts`.
4. **No spec invariant may be protected by unit tests alone.** Examples
   demonstrate; properties forbid.

## Consequences

- **What it caught that unit tests did not** — three defects, all invisible to
  the example-based suites, all corrected in `8f2c0d3` (see README, "Timeline"):
  a session trimmed by its own client's meeting (ADR-0002), a conflict absorbed
  by a merge (ADR-0003), a proven share that counted the night between two
  working days (ADR-0004). The properties were committed *before* the fixes
  (`f40aa94`), so they are an independent guard, not a description written
  after the fact.
- **Cost** — property suites are slower than unit tests (`numRuns` 25–150 per
  property) and need maintained arbitraries
  (`packages/sessionizer/src/properties.test.ts:16-44`,
  `packages/billing/src/arbitraries.ts`).
- **Deliberate exemption** — `HEU-P-01` excludes blocks with `status:
  'conflict'` from the no-overlap assertion, because overlapping is exactly
  what the user must arbitrate
  (`packages/sessionizer/src/properties.test.ts:59-61`).
- **Known gap** — shrunk counterexamples are not archived with their seeds
  (README, "What the code proves, and what only the narrative claims"); a
  future regression cannot be replayed from a seed. Follow-up: fill
  `KIRO_JOURNAL.md` §3 as its own format demands.

## Proof

- Properties pre-date the fixes: `git show f40aa94:packages/sessionizer/src/properties.test.ts`
  already contains `HEU-P-01`…`HEU-P-07`, `HEU-P-13`, `HEU-P-14`; commit
  `8f2c0d3` (the three corrections) does not touch that file
  (`git log --follow --oneline -- packages/sessionizer/src/properties.test.ts`
  lists `f40aa94`, `246eea1`, `a294ac0` — not `8f2c0d3`).
- Hook on save: `.kiro/hooks/interval-properties.json` (trigger `PostFileSave`,
  matcher `packages/(intervals|sessionizer)/.*\.ts$`, timeout 180 s).
- CI: `.github/workflows/ci.yml:65-69`.
- Narrative source for "found by the property suite": `docs/SUBMISSION.md:88-90`,
  `:97-99`, `:201`. Seeds: *not found in the code* (`KIRO_JOURNAL.md:126-131`).
