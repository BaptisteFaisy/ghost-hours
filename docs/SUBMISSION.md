# Submission texts — Kiroween 2026, Frankenstein

Ready-to-paste texts for the Devpost form. Everything below is verified against this repository;
anything that can only be measured inside a Kiro session is written `TODO(measure)`, never invented.

## 1. Project description (form field: description)

Ghost Hours answers a question every independent developer knows: at the end of the month, how many
hours did I actually work? Sofia rebuilds her November from memory and reaches 92 hours. Her Git
commits, her calendar and her dated notes show 104. The missing 12 hours are *ghost hours* — worked,
never billed, €780 at her rate.

Ghost Hours is a Frankenstein of four worlds that never talk to each other: a read-only Git
collector (commits on every reference plus the reflog), an RFC 5545 reader (recurrences, time zones,
exceptions), a Markdown notes reader and an invoice draft. It stitches their proofs into proposed
blocks of time per client, grades each block by the share that is actually proven, and refuses to
choose when two clients' evidence contradicts: that becomes a conflict for the human to settle.
Only confirmed blocks can be billed, and every billed line links back to its proofs.

The whole product is a static page: no account, no server, no request after load. One click loads a
fictitious month whose numbers are recomputed by the test suite, so the demo can never drift from
the code.

*(178 words)*

## 2. Features (form field: features)

Capture

- `HEU-F-01` read-only Git collector, CLI, writes `evidence.json`, modifies no repository
  (`packages/collector`, proven by `readonly.test.ts`)
- `HEU-F-02` `.ics` import (`packages/ics`)
- `HEU-F-03` recurrence expansion with exceptions, per-event time zone, all-day/cancelled/declined/
  transparent events skipped out loud (`packages/ics`)
- `HEU-F-04` dated Markdown notes with timestamped lines and client tags (`packages/notes`)
- `HEU-F-05` manual entries, marked declarative (`apps/web` Settings/Week)
- `HEU-F-06` re-importing the same evidence creates no duplicate (deterministic ids, `packages/core`)

Association

- `HEU-F-07` clients with mode, rate, currency, rounding rule and projects (`apps/web` Clients)
- `HEU-F-08` rules by repository, remote fragment, attendee domain, title fragment, note tag
  (`packages/mapping`)
- `HEU-F-09` orphan evidence listed and attached in one gesture (`apps/web` Clients)
- `HEU-F-10` **not in this edition**: the suggestion is purely heuristic (`suggestCandidates`),
  no model is called anywhere in the product

Reconstruction

- `HEU-F-11` sessions per client cut on `gapMax` (`packages/sessionizer`)
- `HEU-F-12` session start from a reflog checkout or an assumed lead-in, always marked as assumed
- `HEU-F-13` meetings as exact blocks
- `HEU-F-14` overlaps trimmed; contradictions surfaced as conflicts, never guessed
- `HEU-F-15` proven share and confidence level (solid / likely / to confirm) on every block
- `HEU-F-16` deterministic: same evidence, same blocks, whatever the import order
- `HEU-F-17` calibration computed and tested (`calibrate`, median after ten corrections); surfacing
  the suggestion in the UI is **not in this edition** — it is never applied automatically

Review

- `HEU-F-18` week grid with three visually distinct block states (dashed / solid / hatched)
- `HEU-F-19` confirm, reject, resize, split, change client, confirm a day or a week
- `HEU-F-20` evidence panel: every proof a block rests on, with its stitch
- `HEU-F-21` month counter: found, confirmed, declared, ghost hours and their amount
- `HEU-F-22` month view with the load per day

Invoice

- `HEU-F-23` draft computed from confirmed blocks only, lines per project, rounding rule written out
- `HEU-F-24` hourly, daily-by-thresholds and daily-proportional modes
- `HEU-F-25` the draft says **Draft** and carries no invoice number
- `HEU-F-26` evidence annex per day, two detail levels
- `HEU-F-27` CSV timesheet, JSON export, PDF through the browser's print
- `HEU-F-28` **not in this edition** (Factur-X hybrid)
- `HEU-F-29` marking a period invoiced locks its blocks; later reconstructions leave them untouched
- `HEU-F-30` one-click fictitious month (`fixtures/sample-month`)

## 3. Kiro narrative (form field: how you used Kiro)

1. **Strategy.** The work was cut along the specification's own seams: one spec per lot
   (`collector`, `ics-import`, `intervals`, `sessionizer`, `billing`, `review-ui`), in dependency
   order — the interval algebra first because every other property test stands on it. Requirements
   were written in EARS from the start, each carrying its `HEU-F-nn` identifier, so a test failure
   names the requirement it breaks.
2. **Surfaces.** Specs, steering, hooks, agents and skills live in `.kiro/` and are part of the
   product, not scaffolding. `TODO(measure)`: the split between IDE, CLI and Web sessions.
3. **Specs vs vibe coding.** `TODO(measure)`: the timed comparison on `intervals.union`. What is
   already true and written in `KIRO_JOURNAL.md`: the property tests found three defects that unit
   tests missed (a session trimmed by its own client's meeting, a conflict absorbed by a merge, a
   proven share that counted the night between two days).
4. **Steering.** `time.md` (fileMatch on the time-sensitive packages) is the file that changed
   answers the most: it forbids `getFullYear()`-style local reads and names the helper to use
   instead. Before/after example in the journal.
5. **Hooks.** Five hooks in the v1 format; four are `command` actions (no credits), one `agent`
   action for the journal. Each hook guard is doubled in CI by a script in `scripts/`, because file
   triggers only fire on agent-made edits. `TODO(measure)`: trigger counts per hook.
6. **Property tests.** Fourteen properties named after their `HEU-P-nn` identifier, generated with
   fast-check. `TODO(measure)`: the counterexamples found during a Kiro session; the ones listed in
   the journal were found by the property suite in CI.
7. **MCP, powers, agents.** No MCP server was needed; the three custom agents (`time-reviewer`,
   `prudence-reviewer`, `property-tester`) are the surfaces used, plus two skills (`sample-month`,
   `property-hunt`).
8. **What did not work.** The honest one, in the journal: the first hook draft used a trigger name
   that no longer exists in Kiro 1.x; it was caught by reading the installed bundle's schema, not by
   the documentation.

## 4. Blog post draft (bonus: blog post)

# The night my time tracker stopped trusting me

*Written for the Kiroween 2026 hackathon.*

Every time-tracking tool I have used asks me to remember to press a button. The button and I have
a difficult relationship: I press it on Monday, and by Wednesday I am billing from memory. Memory
rounds down. Memory forgets the 20-minute fix at 22:40 and the meeting that turned into a debugging
session. At the end of November, my memory said 92 hours. My repository said 104.

Ghost Hours is the tool I built to stop negotiating with my memory. It reads four sources that were
never designed to agree — Git commits on every reference, the reflog, an iCalendar export and dated
Markdown notes — and proposes blocks of time per client. Then it does the part I care about: it
tells me which minutes are *proven* and which minutes I invented.

That distinction is the whole product. A session starts either at a branch switch the reflog
records, or at an assumed lead-in of thirty minutes — and the assumed part is drawn paler, counted
separately, and never billed on its own. When a commit of one client falls inside a meeting of
another, the tool does not pick a winner. It raises a conflict and waits. A tracker that guesses is
a tracker that inflates, and an invoice that inflates is a lie with a total at the bottom.

The property that keeps me honest is six lines long:

```ts
describe('HEU-P-01 — no two blocks ever overlap', () => {
  it('holds for any scenario', () => {
    fc.assert(fc.property(scenario, (evidence) => {
      const blocks = run(evidence).blocks.filter((b) => b.status !== 'conflict');
      for (let i = 0; i < blocks.length; i += 1)
        for (let j = i + 1; j < blocks.length; j += 1)
          expect(overlaps(span(blocks[i]), span(blocks[j]))).toBe(false);
    }), { numRuns: 60 });
  });
});
```

It looks trivial until you read what it took to make it true. Three defects survived my unit tests
and died under this property. A session was trimmed by its own client's meeting, losing the first
half-hour of the day. A conflict, merged into the session around it, came back out as a *proposed*
block that overlapped another client — the exact thing the property forbids. And the proven share
was computed per client, so the night between two working days made the next morning look proven.
Each fix is one paragraph in the repository's journal; each one is a bill I would have sent wrong.

Kiro is where those paragraphs come from. The specs in `.kiro/specs/` are written in EARS and carry
the identifiers of the requirements, so a red test says *which promise* broke. The steering file
`time.md` is included only in the packages that touch dates, and it bans the local-time reads that
cause DST bugs — the kind of rule that is useless as a comment and useful as context. The hooks run
the interval properties on every save in the two packages where a minute can be stolen, and a
privacy guard fails the build if a real client domain ever reaches the tree. Four of the five hooks
are shell commands, because a guard that costs credits is a guard you switch off.

The demo month is fictitious on purpose: `example.com` addresses, three invented clients, and a
contradiction planted on 16 November so you can watch the tool refuse to choose. Its headline
numbers — 104 hours found, 92 declared, 12 ghost hours, €780 — are not typed anywhere. The
acceptance test recomputes them through the real pipeline, so the video and the code cannot
disagree.

I still forget to press buttons. I just stopped needing to.

*(~640 words)*

## 5. Social post draft (bonus: social post)

Short (first word is the required tag):

> #KiroweenHackathon26 What I prefer in Kiro: specs that carry the requirement ids, so a red test
> names the promise it broke. It changed how I build — my time tracker's three nastiest bugs were
> caught by properties written from the spec, not by my unit tests. ghost-hours, Frankenstein
> category: Git × calendar × notes × invoice draft, all in your browser.

*(447 characters)*

Long variant:

> #KiroweenHackathon26 Three bugs in my Kiroween entry survived every unit test and died under a
> property written straight from the spec: a session trimmed by its own client's meeting, a conflict
> absorbed by a merge, and a "proven share" that counted the night between two working days as
> work. That is what changed for me with Kiro — the spec is not documentation, it is the test
> suite's table of contents. Ghost Hours (Frankenstein): commits, reflog, iCalendar and notes
> stitched into billable blocks, conflicts shown instead of guessed, everything local, one click to
> load a fictitious month that says 104 h found, 92 h declared, 12 ghost hours, €780.

*(486 characters)*

## 6. Video script (form field: video, < 3 minutes)

| Time | On screen | Voice-over (English) |
|---|---|---|
| 0:00–0:20 | A spreadsheet, 30 November, 22:40. The freelancer types "92 h?". Cut to the app's empty state. | "On the 30th, Sofia rebuilds her month from memory. Ninety-two hours. Her commits, her calendar and her notes disagree." |
| 0:20–0:44 | Terminal: `node packages/collector/bin/ghost-hours.mjs collect ~/code --author sofia@example.com --since 2026-11-01`. Then the app: drop `evidence.json`, the `.ics`, the notes folder. | "One command reads every repository, read-only. Then three files are dropped into a page that never calls a server." |
| 0:44–1:08 | Month screen after *Load the sample month*: the counter animates to 104 h found, 92 h declared, **12 h ghost, €780**. | "One hundred and four hours found. Ninety-two declared. Twelve ghost hours — seven hundred and eighty euros she worked and never billed." |
| 1:08–1:42 | Week screen: proposed blocks translucent with dashed borders; click *Confirm* on Monday's block, it turns solid; resize Tuesday's lead-in; open Thursday's conflict (two commits inside another client's meeting), keep one side; open a block's evidence: three commits, one checkout, one meeting, stitched. | "Blocks float until you confirm them. The assumed part is drawn paler than the proven part. And when two clients claim the same minutes, the tool shows the contradiction instead of picking a side." |
| 1:42–2:00 | Invoice screen: lines per project, the rounding rule written out, the **Draft** watermark, the annex per day, then the print dialog producing the PDF. | "Only confirmed blocks reach the draft. It says Draft, it carries no number, and every line links back to the proofs behind it." |
| 2:00–2:21 | A failing property test in the editor (`HEU-P-01`), then `.kiro/`: the spec with EARS requirements, `time.md` steering, the privacy hook firing on a real domain, `.kiroignore`. | "The properties are named after the requirements they protect. This one found three bugs my unit tests missed. And a guard fails the build if a real client domain ever reaches the repository." |
| 2:21–2:59 | Terminal: `collect --repo … --no-summaries` on a real month, then `anonymize-evidence.mjs` printing `977 item(s), 3 repository(ies), 437 branch name(s) replaced`. Cut to the app: **Load a real month**, 34.2 h found, 7 contradictions, then the declared hours typed by hand and the ghost amount appearing. Final frame: the URL and the licence. | "This last month is not a fixture. Nine hundred and seventy-seven proofs, read-only, names replaced, commit messages never read. Thirty-four hours found, seven real contradictions — and the ghost hours appear only when I type what I remember. Ghost Hours — MIT, static, and yours." |

The seven beats above are the single source of truth for the video: `~/Bureau/ghost-hours-video/beats.mjs`
holds their exact slots (0:00–0:20, 0:20–0:44, 0:44–1:08, 1:08–1:42, 1:42–2:00, 2:00–2:21,
2:21–2:59, total 179 s), and `make-subtitles.mjs` turns the narration into the English subtitle track.

### Recording checklist

- Window 1440×900, browser in private mode, light theme; erase all data first
  (Settings → *Erase everything*) so the empty state is genuine.
- No music, no third-party logo on screen (the terminal prompt shows only the command).
- Voice-over in English, or English subtitles burned in.
- Total runtime under 3:00; export MP4, 1080p, upload public (unlisted is not public).
- The 2:45 shot is reproducible verbatim:
  `node packages/collector/bin/ghost-hours.mjs collect <this repository> --author <your email>`.
- The real-month shot shows the anonymizer's own output, which names nothing: never film the
  `--print-map` table, a real path or a real repository name.
