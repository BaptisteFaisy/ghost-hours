---
name: sample-month
description: Regenerate or extend the fictitious demo month in fixtures/sample-month (3 clients, 104 h found, 92 h declared, 12 ghost hours, ≈€780) without ever putting real client data in it. Use when the demo dataset must change, when the acceptance numbers move, or when a new screen needs sample data.
---

# Sample month

`fixtures/sample-month` is the dataset the judges load in one click (HEU-F-30) and the one the
acceptance tests assert against. It is entirely made up, and it must stay that way.

## The numbers it must produce

| Quantity | Value | Where it comes from |
|---|---|---|
| clients | 3 — Acme, Northwind, Globex | `clients.json` |
| hours found | 104 h | sum of all blocks (proposed + confirmed) |
| hours declared | 92 h | `declaredMinutes` in the dataset |
| ghost hours | 12 h | `declared - found`, shown as positive |
| amount | ≈€780 | 12 h × €65/h (Acme's rate) |
| period | November 2026 | `2026-11-01` … `2026-12-01`, Europe/Paris |

If a change moves one of these numbers, move all of them consistently and update
`docs/acceptance.md`, the README table and the journal entry in the same commit. A demo whose
counter disagrees with the README is worse than no demo.

## Files

```
fixtures/sample-month/
├── evidence.json      collector-format evidence (git commits, checkouts, meetings, notes)
├── agenda.ics         the calendar export, with one weekly recurring meeting
├── notes/             dated Markdown notes with timestamped lines and client tags
├── dataset.json       clients, rules, blocks, settings, declared minutes
└── README.md          one paragraph: what this dataset shows, and that it is fictitious
```

## Hard rules

1. **Fictitious only.** Clients `Acme`, `Northwind`, `Globex`; people `Sofia Marquez`,
   `Malik Osei`, `Yuki Tanaka`; domains `example.com` / `example.org` / `example.net`; repos
   `acme-api`, `northwind-portal`, `globex-etl`. Nothing else, ever.
2. **Plausible, not tidy.** A real month is lumpy: a 20-minute meeting, an evening fix, a day off, a
   week with one client only. A dataset where every day is 8 h demonstrates nothing and hides bugs.
3. **One conflict, on purpose.** A Thursday where two commits of one client fall inside another
   client's meeting. The demo script needs it (D.16, 1:10–1:50).
4. **One long assumed lead-in.** A block whose evidence starts well after its start, so the
   assumed/proven split is visible on screen.
5. **A DST-safe month.** November 2026 has no DST change in Europe/Paris — keep it that way in the
   demo, and cover DST in tests instead, so the demo numbers stay simple.
6. **Deterministic ids.** Every id in `evidence.json` is what `commitEvidenceId`, `meetingEvidenceId`
   and friends produce for those inputs. Never a random id.
7. **Small.** Under 400 evidence items, under 200 KB total. The app parses it in the browser.

## Procedure

1. Read the existing files and the acceptance test that asserts the numbers
   (`apps/web/src/...` or `packages/*/src/*.test.ts` — search for `104`).
2. Edit the smallest file that can produce the change. Prefer adding evidence over rewriting the
   dataset: the reconstruction must derive the blocks, not be handed them.
3. Regenerate the derived blocks by running the reconstruction (a script or a test), never by hand.
   Hand-written blocks drift from the algorithm and hide its bugs.
4. Run the acceptance test. If it fails on a number, decide whether the fixture or the expectation
   is wrong, and say which in the commit message.
5. Run the guards: `node scripts/check-privacy.mjs` and `node scripts/check-no-network.mjs`.
6. Update the numbers in `README.md`, `docs/acceptance.md` and `KIRO_JOURNAL.md` in the same change.

## Extending to a second month

Only if a screen needs it: add `fixtures/sample-month-2/` with a different shape (a month with a
DST change, or a month with a single client), keep the first one untouched — the demo and the video
depend on it byte for byte.

## What not to do

- Do not copy a real `.ics` export, even "just to see". `.gitignore` and `.kiroignore` exclude
  `*.ics` outside `fixtures/` for exactly this reason, and the privacy guard will catch it.
- Do not paste real commit subjects. "Add CSV export" is fine; a client's internal project name is
  not.
- Do not change the fixture to make a failing test pass. The fixture is the specification of the
  demo; the test is what protects it.
