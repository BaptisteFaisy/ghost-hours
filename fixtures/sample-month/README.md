# The sample month

One fictitious month — November 2026 — for one fictitious freelancer, Sofia Marquez
(`sofia@example.com`), with three fictitious clients. This is what the judges load with one click,
and what the acceptance tests assert.

| File | What it is |
|---|---|
| `evidence.json` | The Git evidence, in the interchange format of spec D.10 (commits and reflog checkouts, unmapped) |
| `calendar.ics` | The month's agenda: three recurring series, one moved occurrence, one cancelled instance, one cancelled event, one personal slot and one all-day event |
| `notes/` | Eight dated Markdown notes with timestamped lines and `#client:` tags |
| `expected.json` | The numbers the month must produce |
| `index.ts` | `loadSampleMonth()`, the three clients and their mapping rules |
| `sample-month.test.ts` | The acceptance test: it recomputes the numbers through the real pipeline |

## The story it tells

Sofia declares **92 h** for the month. Her commits, her agenda and her notes show **104 h**. The
difference is **12 ghost hours**, worth **€780** at her Acme rate of €65 an hour.

| Client | Found | Declared | Ghost hours | Billing mode |
|---|---|---|---|---|
| Acme | 62 h | 50 h | **12 h (€780)** | hourly, €65/h |
| Northwind | 26 h | 26 h | 0 | daily by thresholds, €520/day |
| Globex | 16 h | 16 h | 0 | daily proportional, €480/day |

The month also shows the states the reviewer must be able to tell apart:

- **A contradiction** (2 conflicts): on 16 November Sofia committed to `acme-api` at 11:20 and 11:45
  while her calendar holds the *Northwind architecture review* from 11:00 to 12:00. Two exact
  proofs disagree, so the tool refuses to choose: the Acme session and the Northwind meeting are
  both marked in conflict, and the rest of the Northwind day is cut around the meeting and stays
  billable.
- **A block that is not proven** (3 of them): the 45-minute hotfix session of 11 November holds two
  commits and a 30-minute assumed lead-in, so its proven share stays low and it is graded
  *to confirm*.
- **Skipped calendar entries**: the cancelled event, the personal slot (`TRANSP:TRANSPARENT`) and the
  all-day company offsite are not work. The reader reports them instead of dropping them silently.

## Extending it

Change `evidence.json`, `calendar.ics` or the notes, then run `pnpm vitest run fixtures` and update
`expected.json` with the numbers the test prints. Never put real data here: the guard
`scripts/check-privacy.mjs` fails the build on any domain outside `example.com`, `example.org`,
`example.net`, `example.edu` and `localhost`, and `.kiroignore` keeps real evidence files out of the
agent's reach.
