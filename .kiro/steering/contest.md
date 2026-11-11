---
inclusion: manual
---

# Ghost Hours — contest steering (Kiroween 2026)

Load this file with `#contest` when working on submission material: README, journal, video script,
the Devpost form. It is manual on purpose — it is noise during normal coding.

## Submission checklist (annex 1)

### Repository

- [ ] Public GitHub repo, created after 30 October 2026.
- [ ] MIT `LICENSE` at the root, licence shown in the *About* box.
- [ ] `/.kiro` at the root, **tracked by Git**, never in `.gitignore`.
      Guard: `node scripts/check-kiro-tracked.mjs` (CI + `kiro-folder-guard` hook).
- [ ] README in English: what it does, how to run it, demo mode, dependencies and their licences,
      pre-existing code if any.
- [ ] `KIRO_JOURNAL.md` up to date.

### Application

- [ ] Public URL, usable in private browsing, no account.
- [ ] Demo mode in one click (`Load the sample month`, HEU-F-30).
- [ ] Hosting kept up until at least 29 January 2027.
- [ ] Test instructions for the judges, ready to paste in the form field.

### Video

- [ ] Under 3 minutes, public on YouTube.
- [ ] The project works on screen, on the target device.
- [ ] No copyrighted music, no third-party brand.
- [ ] In English or with English subtitles.

### Form texts

- [ ] Category chosen: **Frankenstein**.
- [ ] Feature description.
- [ ] Kiro usage narrative (annex 2 template, filled from `KIRO_JOURNAL.md`).
- [ ] Bonuses ticked with their evidence: blog post URL, social post URL.

### Bonuses

- [ ] Blog post published during the period, on a third-party platform, stating it is written for
      Kiroween 2026.
- [ ] Social post **starting with** `#KiroweenHackathon26`, saying what I prefer in Kiro and how it
      changed the way I develop.
- [ ] Ghost of Kiroween Past — only if registered for the 2025 edition.

## The five judging criteria, and this project's answer

| Criterion (20 % each) | What the judges look for | Ghost Hours' answer |
|---|---|---|
| **Potential impact** | a real problem, a real audience, a useful and accessible solution | Sofia, freelance developer, 30 November evening: 92 h from memory against 104 h of evidence — 12 ghost hours, ≈€780. The app measures the gap itself, in hours and in money. Sofia is a named persona with a dated situation, shown in the first 20 seconds of the video. |
| **Technical implementation** | depth and variety of Kiro usage, strategy, experimentation | Eight specs, ten steering files, five hooks (three `command`, one `agent`), three custom agents, two skills, a tracked `.kiro/` and a journal kept as we go. Fourteen fast-check properties, each named after its requirement id. Two of them (P-01, P-02) came out of the interval algebra where hand-written tests were blind. |
| **Design** | a complete, coherent product, not a proof of concept | Six screens with empty / error / loading states; AA accessibility (keyboard grid, three non-colour aspects, equivalent table, `prefers-reduced-motion`); one art idea — ghosts taking flesh, and a seam that stitches evidence along each block — applied consistently. Demo dataset polished. |
| **Innovation** | a new idea, unusual combination of technologies or public data | Existing tools are manual timers (forgotten), continuous trackers (intrusive) or Git-only estimates (blind to meetings). Ghost Hours crosses four sources *after the fact*, with no daemon, human validation block by block, traceability down to the evidence, entirely local. The seam glyphs make the cross-referencing visible. |
| **Presentation** | a clear, memorable video: problem, audience, why it matters | Scripted in four beats (D.16): the empty spreadsheet on the 30th; collection in one command; "104 h found — 12 ghost hours — €780"; how Kiro served; closing on the project's own hours reconstructed by the tool itself. |

## One-sentence pitch

> Ghost Hours reconstructs the hours you actually worked — from your commits, your calendar and your
> notes — and drafts the invoice you forgot to send, with every hour pointing back at its evidence.

## What must never appear in submission material

- A real client, employer, colleague or repository name. Fictitious only: Acme, Northwind, Globex;
  Sofia Marquez, Malik Osei, Yuki Tanaka; `example.com` / `example.org` / `example.net`.
- A number we did not measure. If it is not in the app or the journal, it is not in the video.
- A claim that the tool "tracks" or "monitors" work. It proposes; the human confirms.
- Any third-party trademark or copyrighted music in the video.
- Any sentence presenting the invoice draft as a real invoice.

## Numbers allowed in the submission (all from the sample dataset)

| Number | Value | Source |
|---|---|---|
| hours found | 104 h | `fixtures/sample-month` |
| hours declared | 92 h | same fixture |
| ghost hours | 12 h | computed, HEU-F-21 |
| amount | ≈€780 at €65/h | computed |
| clients | 3 (Acme, Northwind, Globex) | fixture |
| properties | 14 (`HEU-P-01` … `HEU-P-14`) | cahier D.12 |

Anything else — spec-vs-vibe-coding durations, hook trigger counts, counterexamples found — must be
measured in a real Kiro session first and is marked `TODO(measure)` in the journal until then.
