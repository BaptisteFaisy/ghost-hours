# Architecture decision records — Ghost Hours

These records explain why the code of Ghost Hours looks the way it does, for a
reader who has to decide whether to trust it: an author, a reviewer, a judge.
Every record cites the exact file, line and test that supports its claim; where
a claim cannot be traced in the repository, the record says so and names its
source instead of guessing.

## Conventions used by every ADR

- **Status** — `Accepted` (the decision is in the code) or `Superseded`.
- **Sections** — `Context`, `What went wrong`, `Decision`, `Consequences`, `Proof`.
- **Proof** cites `path:line` as of `origin/main` (commit `a294ac0`), and/or the
  exact name of a test, so every claim can be checked without reading the whole
  repository.
- **Honesty rule** — a claim that cannot be traced is written as *not found in
  the code*; the source of the claim is then named (a commit message, the
  journal, the submission text).

## What the code proves, and what only the narrative claims

ADR-0002 to ADR-0004 describe three defects that exist in two places, and the
two places do not say the same thing:

- **The code and the history** — the defective behaviour *and* its correction
  are both visible in the git history (`git show 8f2c0d3 -- packages/sessionizer/`).
- **The narrative** — the submission text describes the three defects in prose
  (`docs/SUBMISSION.md:88-90`, `docs/SUBMISSION.md:144-149`) and the video
  script attributes them to the property suite (`docs/SUBMISSION.md:201`).

What is **not** in the repository: the shrunk counterexamples. The journal's own
ledger for them is empty — `KIRO_JOURNAL.md:126-131` states that no property has
been run in a Kiro session and that the format to use is still to be filled in.
`docs/SUBMISSION.md:98-99` carries the same caveat: the counterexamples were
found by the property suite in CI, not archived with their seeds. The ADRs below
therefore cite the defects and the fixes as code facts, and mark the seeds as
*not found in the code*.

## Timeline the ADRs rely on

| When | Commit | What it establishes |
| --- | --- | --- |
| 2026-11-11 02:25 | `f40aa94` | The sessionizer **and its property suite** exist before the fixes: `packages/sessionizer/src/properties.test.ts` already carries `HEU-P-01`…`HEU-P-07`, `HEU-P-13`, `HEU-P-14`. |
| 2026-11-11 03:35 | `8f2c0d3` | "mois fictif de démonstration + **trois correctifs du sessionizer**" — the three corrections, plus the fictitious demo month that re-checks them. The property file is *not* touched by this commit: the properties were already there, the code had to catch up. |

## Index

| ADR | Title | Status | Subject |
| --- | --- | --- | --- |
| [ADR-0001](ADR-0001-property-tests.md) | The fast-check properties are a first-class guard | Accepted | Why the invariants of the spec are executable, and what that bought |
| [ADR-0002](ADR-0002-session-trimmed-by-its-own-meeting.md) | A meeting trims only the sessions of *another* client | Accepted | A session was cut by its own client's meeting |
| [ADR-0003](ADR-0003-conflict-absorbed-by-a-merge.md) | A contradiction is never merged away | Accepted | A conflict disappeared into a merge and came back as an overlapping proposed block |
| [ADR-0004](ADR-0004-proven-share-counted-the-night.md) | The proven share is computed per block, never per client | Accepted | The night between two working days was counted as proven work |
| [ADR-0005](ADR-0005-chained-audit-trail.md) | The decision log is a local hash chain | Accepted | Every decision leaves a trace that cannot be edited unnoticed |
