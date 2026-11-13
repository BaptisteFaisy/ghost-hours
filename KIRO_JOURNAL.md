# Kiro usage journal — Ghost Hours

This file answers, as the work happens, the eight questions the Kiroween submission form asks. It is
written in English because the submission is in English. It is deliberately boring: a claim without
a file path or a command behind it does not belong here.

**Reading rule.** Anything marked `TODO(measure)` has not been measured yet and must not be quoted in
the video, the Devpost text or the README until it is. The only numbers allowed in submission
material today are the ones the sample dataset produces (104 h found, 92 h declared, 12 ghost hours,
≈€780) — and those come from the fixture, not from this journal.

---

## 1. The eight questions, answered

| Question (form) | Short answer | Where the evidence is |
|---|---|---|
| **Which Kiro surfaces, and how do they differ?** | Specs for every domain lot (requirements → design → tasks), steering as the durable memory of the rules, hooks as the enforcement while coding, custom agents as read-only reviewers, skills as the two repeated procedures. Differences are noted per entry below: specs structure the thinking, hooks catch what specs cannot enforce, agents re-read what the author stops seeing. | `.kiro/specs/*/`, `.kiro/steering/*.md`, `.kiro/hooks/*.json`, `.kiro/agents/*.md`, `.kiro/skills/*/SKILL.md` |
| **Custom agents?** | Three: `time-reviewer` (read-only, dates and zones), `prudence-reviewer` (read-only, nothing inflated), `property-tester` (may run `pnpm *` to reproduce and shrink a counterexample). Their effect: `TODO(measure)` — no review has been run through them yet. | `.kiro/agents/time-reviewer.md`, `prudence-reviewer.md`, `property-tester.md` |
| **Which hooks, what gain?** | Four hook files, five hooks: `interval-properties` (runs the property suites on save in `intervals`/`sessionizer`), `fixture-privacy-guard` (no non-fictional domain may land), `no-network` (no `fetch`/XHR/CDN in `packages` or `apps`), `journal-reminder` (one `agent` action after a spec task, plus a `Stop` command reminder), `kiro-folder-guard` (`PreToolUse`, refuses a write that would gitignore `.kiro`). Trigger counts: `TODO(measure)` — hooks fire only inside a real Kiro session. | `.kiro/hooks/` |
| **Spec against "vibe coding"?** | The comparison function is chosen: `normalize()` in `packages/intervals` — twenty lines of "sort, merge, done" that is wrong in three ways only a property test finds. Numbers (duration both ways, round trips, defects found): `TODO(measure)`. The procedure and the three expected defects are written in `.kiro/specs/intervals/design.md` §8. | `.kiro/specs/intervals/` |
| **Which steering made the difference?** | `time.md` and `prudence.md`, because they forbid the two shortcuts an assistant reaches for by default: arithmetic on local time, and a block quietly widened to a round hour. Before/after example: `TODO(measure)` — needs a real transcript to quote. The rules themselves are quotable today. | `.kiro/steering/time.md`, `prudence.md` |
| **What did MCP enable?** | Nothing yet. No MCP server is declared for this project; `.kiro/settings/mcp.json` does not exist. Honest answer for the form: MCP was not used, and the offline constraint made a documentation server the only plausible candidate. | — |
| **Did property tests find defects?** | Fourteen properties are specified and owned (`HEU-P-01` … `HEU-P-14`). Counterexamples found so far: `TODO(measure)` — none recorded, because no property has been run yet in a Kiro session. The journal section below is where each one will be written, with its seed and its shrunk case. | `.kiro/specs/*/design.md` §7 |
| **Which powers?** | None installed. The two repeated procedures of this project became **skills** instead (`sample-month`, `property-hunt`), because they are project-specific and a power would have been a wrapper around a skill. | `.kiro/skills/` |

---

## 2. Entries

Each entry records: the Kiro surface used, the decision taken (and the alternative rejected), the
evidence produced, and a measurement when one exists.

### 2026-11-11 — `.kiro/` foundation: steering

- **Surface**: steering (ten files, five `always`, four `fileMatch`, one `manual`).
- **Decision**: split steering by *audience of the rule* rather than by package —
  `product` (why), `tech` (the stack and its prohibitions), `structure` (where code goes),
  `testing` (how it is proven), `privacy` (HEU-N-01/06), `prudence` (the D.5 principle),
  and then three `fileMatch` files that only load where they apply (`time` on the four time-touching
  packages, `evidence-format` on `collector`, `ui` on the web app), plus `contest` as `manual`.
  Rejected alternative: one big `conventions.md`. It would have been included everywhere and read
  nowhere.
- **Why `manual` for `contest.md`**: the submission checklist is noise while coding a rounding
  function. It is loaded with `#contest` when the README, the journal or the video script is written.
- **Evidence**: `.kiro/steering/{product,tech,structure,testing,privacy,prudence,time,evidence-format,ui,contest}.md`.
- **Measured**: 10 files, 908 lines total. Largest: `time.md`, 115 lines.

### 2026-11-11 — `.kiro/` foundation: six specs

- **Surface**: specs, requirements-first for five of them, design-first for `review-ui`.
- **Decision**: one spec per lot of D.13, and each requirement carries the cahier's own identifier
  (`HEU-F-01` … `HEU-F-29`) with its priority (I/S/O) and at least one `#### Scenario:`. Rejected
  alternative: rewriting the cahier's requirements into "user stories" with fresh numbering — it
  would have broken the traceability from a failing property back to a line of the specification.
- **Why `review-ui` is design-first**: for the week grid, the shape of the interaction (three
  non-colour aspects, keyboard parity, the assumed/proven split) determines what can be required at
  all. Writing the requirements first would have produced a list of gestures that the art direction
  then had to contradict.
- **No task is ticked**: the tasks are the plan handed to Kiro, not a record of work done.
- **Evidence**: `.kiro/specs/{collector,ics-import,intervals,sessionizer,billing,review-ui}/{requirements,design,tasks}.md`.
- **Measured**: 18 files, 2 901 lines total. `billing/requirements.md` is the largest at 286 lines.

### 2026-11-11 — `.kiro/` foundation: hooks

- **Surface**: hooks (format v1, `version` + `hooks[]`).
- **Decision**: four `command` actions and exactly **one** `agent` action. Command actions cost no
  credits and are deterministic, so everything that can be a script is a script; the single agent
  action is the journal reminder, because writing a journal line needs the session's context and
  cannot be scripted. Rejected alternative: an agent action for the property run — it would have cost
  credits on every save of a `.ts` file in two packages.
- **The two hooks that are not about tests**:
  - `kiro-folder-guard` runs `check-kiro-tracked.mjs --block` on `PreToolUse`/`write`. Exit code 2
    refuses the tool call, which is how the contest rule "`/.kiro` present and never gitignored" is
    enforced by the tool rather than by memory.
  - `fixture-privacy-guard` is the hook shown on screen in the demo: the product promises no real
    client data, and the repository it is built in is held to the same rule.
- **Known limitation, stated up front**: file hooks only fire on agent-made edits. Every guard is
  therefore doubled in CI, and `scripts/README.md` says so.
- **Evidence**: `.kiro/hooks/{interval-properties,fixture-privacy-guard,no-network,journal-reminder,kiro-folder-guard}.json` (5 files, 5 hooks). All five validate with `python3 -m json.tool`.
- **Measured**: trigger counts `TODO(measure)` — a hook only fires inside a Kiro session, and none
  has been run yet.

### 2026-11-11 — `.kiro/` foundation: agents and skills

- **Surface**: custom agents (`.kiro/agents/`) and skills (`.kiro/skills/`).
- **Decision**: two agents are read-only (`tools: ["read"]`) and one may run commands, with
  `permissions.rules` allowing `pnpm *` and `node scripts/*` but denying `pnpm add`, `pnpm install`,
  `pnpm remove` and `git push`. Rejected alternative: giving all three full shell access — a reviewer
  that can edit the thing it reviews is not a reviewer.
- **Why these two skills**: `sample-month` and `property-hunt` are the two procedures this project
  repeats, and both are places where a careless step is expensive (a real `.ics` in the fixture; a
  property weakened to make a test pass). A skill is the right size; a power would have been a
  wrapper around a skill.
- **Evidence**: `.kiro/agents/{time-reviewer,prudence-reviewer,property-tester}.md`,
  `.kiro/skills/{sample-month,property-hunt}/SKILL.md`.
- **Measured**: effect on real reviews `TODO(measure)` — no review run yet.

### 2026-11-11 — `scripts/`: the guards, and why they exist as scripts

- **Surface**: plain Node scripts, called by hooks and by CI. Not a Kiro surface, and that is the
  point: a guard that only exists as a hook is a guard that a human edit walks past.
- **Decision**: five scripts, standard library only, shared helpers in `scripts/lib/` rather than
  copied. Rejected alternative: writing them as Vitest tests — they must run before dependencies are
  installed, in a job that is allowed to fail in seconds.
- **The interesting one**: `check-privacy.mjs` had to be narrowed twice before it was usable. A naive
  "any domain-shaped token" rule produced 118 findings on a clean tree, all of them JavaScript
  property names (`record.at`, `client.name`, `entry.name`) — a guard that cries wolf gets switched
  off, which is worse than no guard. The fix: judge emails and URL hosts everywhere, quoted strings
  in source files, bare tokens only in data files, and keep a short TLD list so `index.ts` is not a
  domain. Second fix: `example.org` must accept its subdomains (`acme.example.org` is fictitious).
  Both fixes are documented in the script header.
- **Evidence**: `scripts/{check-privacy,check-no-network,check-kiro-tracked,journal-hint}.mjs`,
  `scripts/lib/{files,report}.mjs`, `scripts/README.md`.
- **Measured**: `node scripts/check-privacy.mjs` → `OK check-privacy (189 files scanned)`;
  `node scripts/check-no-network.mjs` → `OK check-no-network (119 source files scanned)`;
  `node scripts/check-kiro-tracked.mjs` → `OK check-kiro-tracked`. Negative tests run by hand:
  a fixture holding a non-fictional email and a non-fictional country-code domain fails with 2
  findings; a source file with `fetch(` and a `VITE_*API*` endpoint fails with 2 findings, plus 1
  for a CDN `<script src="https://…">` in an HTML file; a `.gitignore` containing `.kiro/` fails,
  and returns exit 2 with `--block`. (Writing those literals in this journal was itself caught by
  the guard — which is the point.)

---

## 3. Property counterexamples

Each line here must be real: a property id, the seed, the shrunk case, the fix. Nothing yet.

```
(none yet — no property has been run in a Kiro session; see TODO(measure) above)
```

Format to use when the first one lands:

```
- HEU-P-08, seed 20261108 — <the shrunk case> gave <wrong result>; cause: <one sentence>;
  fixed in <file:line>; regression test kept at <file:line>.
```

## 4. Spec against "vibe coding" — the protocol

Written before measuring, so the measurement cannot be chosen after the fact.

- **Function**: `normalize(ranges)` in `packages/intervals` — sort, merge touching or overlapping
  ranges, drop empty ones.
- **Path A (spec)**: requirements → design → tasks → implementation, with `HEU-P-01` written as a
  `fast-check` property with a fixed seed.
- **Path B (vibe coding)**: the same prompt to the same model, "write a function that merges
  overlapping time ranges", no steering, no property.
- **What is counted**: wall-clock duration, number of round trips (prompt → usable code), and
  defects found afterwards by the same property test applied to both versions.
- **Expected outcome, stated in advance**: path B fails on (1) touching ranges that are not merged,
  (2) an inverted range surviving, (3) a `difference`-style merge that loses a range. If it does not
  fail, the honest journal entry says so.
- **Numbers**: `TODO(measure)`.

## 5. What did not work (kept honest on purpose)

The form's eighth question asks for one honest difficulty. These are real, from this build:

1. **The privacy guard's first version was unusable.** 118 findings on a clean tree, all false
   positives from JavaScript property names. Two rounds of narrowing were needed before it could be
   left enabled. A guard that cannot be trusted is a guard that will be disabled in a hurry.
2. **Steering files compete for the context window.** Ten files with `inclusion: always` would have
   been counter-productive, so five are `always`, three are `fileMatch`, one is `manual`. The split
   was a decision, not a default.
3. **No MCP server is declared.** The offline constraint (HEU-N-01) rules out most of the useful ones
   for this project, and inventing one to tick a box would have been dishonest. The form answer says
   so plainly.

## 6. Submission artefacts — state

- [x] README in English with the dependency licences (listed in prose, `README.md:185`).
- [x] `docs/ACCEPTANCE.md` with the eight acceptance checks of D.17.
- [x] Video script (D.16), under 3 minutes — `docs/SUBMISSION.md` §6, cut into seven beats; the
      montage and the English subtitles are generated from `~/Bureau/ghost-hours-video/`
      (`beats.mjs` → `make-subtitles.mjs` → `record-beats.mjs` → `assemble.sh`), kept out of the
      repository because they carry the video, not the code.
- [x] Blog post and social post drafts — `docs/SUBMISSION.md` §4 and §5. Publishing them on a
      third-party platform is a human step (needs a real account), not done here.
- [ ] Fill every `TODO(measure)` in this file from a real Kiro session — still open, needs a
      session in Kiro (IDE/CLI/Web split, spec-vs-vibe codings timings, hook trigger counts).

### End-to-end smoke suite implemented and run (browser, 4 tests)

The `e2e-smoke` spec was implemented and run: `pnpm e2e` against a local preview of the built app,
**4 passed in 8.3 s** (Chromium, 1440×900). Requirement 2 is the one worth quoting — across all six
screens the browser made **no request to a foreign origin and logged no console error**. The suite
runs after each deploy and on demand, never on a pull request, so the five-minute verdict stands.
The 23 tasks of `.kiro/specs/e2e-smoke/tasks.md` are ticked from that run. The session inside Kiro
itself (steering questions, hook trigger counts, spec against vibe coding) is still
`TODO(measure)` — the steps are written in `docs/KIRO-SESSION.md`.
