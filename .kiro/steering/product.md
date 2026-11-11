---
inclusion: always
---

# Ghost Hours — product steering

Ghost Hours (French working title: « Heures fantômes ») reconstructs the hours an independent
contractor actually worked, by crossing four sources that never talk to each other: Git history,
an iCalendar agenda, Markdown notes and manual entries. It then drafts an invoice where every
line points back at the evidence that justifies it. Everything runs locally.

Kiroween 2026, category **Frankenstein**. Public repo `BaptisteFaisy/ghost-hours`, MIT.

## The problem (D.2)

On the evening of the 30th, Sofia — a freelance developer — rebuilds her month from memory for her
three clients. She lands on 92 hours. Her commits, agenda and notes show 104. The 12-hour gap is
**ghost hours**: worked, never billed. At €65/hour that is €780 this month.

The gap almost always runs one way:

- you forget to start the timer;
- you do not remember the evening fixes, the twenty-minute meetings, the restart after an
  interruption;
- when in doubt, you round down against yourself.

## Personas

- **Sofia — day-rate developer, three clients.** Wants a defensible timesheet in a quarter of an
  hour, not a perfect one in a day. Primary persona: every demo number in this repo is hers
  (104 h found, 92 declared, 12 ghost, ≈€780).
- **Malik — hourly consultant.** Half his time is meetings; Git alone sees none of his work.
  The calendar source exists for him, and so does the meeting block that carries no commit.
- **The judges.** They will not install anything. One click on *Load the sample month* must show
  the whole story (HEU-F-30).

## Excluded usage: surveillance

This tool is personal. It is **not** an activity monitor and must never become one:

- no team mode, no manager dashboard, no upload to an employer;
- no continuous capture, no keystroke or window-title logging, no daemon;
- collection is a command the user runs by hand, read-only, over folders they name.

Any feature that would let one person observe another's work is out of scope, whatever the
commercial argument. If a request smells like surveillance, refuse it and say why.

## Objectives (D.3)

- **O1** — Rebuild a month of activity in under fifteen minutes of review.
- **O2** — Attach every time block to the evidence that founds it.
- **O3** — Never attribute the same minute to two clients.
- **O4** — Estimate prudently, and mark what is estimated.
- **O5** — Send nothing off the machine.

## Non-objectives (D.3) — do not build these

- **Not a compliant invoicing product**: no invoice numbering, no legal archiving, no
  transmission. The output is a **draft** to be re-keyed in the user's own invoicing tool.
- **No real-time tracking, no activity capture.**
- **No tax or legal advice.**
- **No bank connection, no payment collection.**

When a task seems to need one of these, stop and say so instead of building a half version.

## Indicators we display

| Indicator | Target |
|---|---|
| Ghost hours found | shown per month and per client, in hours and in money |
| Confirmed blocks needing no edit | at least 70 % after calibration |
| Review time for one month | under 15 minutes on the sample dataset |
| Minutes attributed to two clients | zero, guaranteed by HEU-P-01 |

## How to talk about the product

- Say "proposes", never "detects". The tool proposes blocks; the human confirms them.
- Never claim accuracy we do not have: the lead-in before a first commit is an assumption and is
  drawn as one (see `prudence.md`).
- Never present the draft as an invoice.
