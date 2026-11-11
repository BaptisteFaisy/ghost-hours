# Running the Kiro session that the journal is missing

The repository carries seven specs, ten steering files, five hooks, three custom agents and two
skills. What it does **not** yet carry is the trace of a session where the tool itself did the
work: the journal marks those measurements `TODO(measure)` because they cannot be invented.

This page is the shortest path from "the folder is ready" to "the journal is honest".

## Before you start

- Kiro IDE is installed on this machine (`/usr/bin/kiro`, version 1.4.86) but **it was never
  logged in** on it: `~/.kiro/sessions/` is empty. Sign in with the account that carries the
  Kiroween credits, otherwise the session will not reach a model.
- The 4 000 credits must be requested **before 1 December** (selfie + identity document). The
  request page is linked from the Kiroween resources tab; the credits are what pay for the session
  below, and a command-line action (`command`) costs none of them.
- Open the repository as the workspace folder, not a parent directory:

  ```bash
  kiro /home/baptiste/Bureau/ghost-hours
  ```

## The session (≈ 30 minutes)

1. **Steering first.** Ask Kiro: *"Summarise the steering files that apply to `packages/sessionizer`
   and tell me which rule you would break first."* If it names `time.md` and the instants, steering
   is doing its job; if it speaks of local time, the `fileMatch` pattern needs fixing. Write the
   answer down — this is the "before" of the steering entry.
2. **Run one spec.** Pick `e2e-smoke` (it is written, unchecked, and produces artifacts) or
   `review-ui`. Use Kiro's spec task execution: the tasks tick themselves from `- [ ]` to `- [x]`,
   checkpoints appear, and the hooks fire:
   - `interval-properties` runs the interval and sessionizer properties on every save in those two
     packages — the fast feedback loop the specification asks for;
   - `fixture-privacy-guard` and `no-network` run on every saved file;
   - `journal-reminder` asks the agent to add a line to `KIRO_JOURNAL.md` after a spec task.
3. **Make it fail on purpose.** Change one interval so that `HEU-P-01` breaks, let the hook catch
   it, and paste the counterexample. That is the "spec against vibe coding" entry: the spec said
   the property, the tool found the counterexample, the hook ran the suite in seconds.
4. **Fix it and let the suite go green again.** The journal entry is complete when it says what
   broke, how long it took, and what the fix was.

## What to paste in `KIRO_JOURNAL.md`

| Entry | Where it comes from |
|---|---|
| Wall-clock of the spec run vs the same change written by hand | the IDE timestamps and your own stopwatch |
| Hook trigger counts | Kiro's session log, or the number of runs visible in the CI |
| A property counterexample found by the suite | the fast-check output (seed included) |
| What `time.md` changed in the agent's answers | step 1 above, before and after |
| What the three custom agents changed | run `time-reviewer` on a date-heavy file and keep its verdict |

## Then

- Commit the journal changes in the repository (a pull request, the queue merges it like any
  other).
- Put the session in the submission form: the eight points of the narrative are already written in
  `docs/SUBMISSION.md`, section 3 — replace its `TODO(measure)` markers with the figures you just
  measured.

## If the IDE cannot be used

The same trace can be produced with the Kiro CLI in headless mode (the documentation describes
`kiro chat` in non-interactive mode), provided the CLI is installed and authenticated. That path is
not configured on this machine yet: the binary found at `/usr/bin/kiro` is the IDE.
