# Requirements — `billing`

Feature: rounding, the three billing modes, caps, the invoice draft, the evidence annex and the
exports (cahier D.6). Owner package: `packages/billing`.
Covers **HEU-F-23** … **HEU-F-29** and properties **HEU-P-08**, **HEU-P-09**, **HEU-P-10**.
Path chosen: **requirements first** — money arithmetic is where a "reasonable" shortcut becomes a
dispute.

## Introduction

Sofia works for three clients on three different arrangements: Acme by the hour, Northwind by the
day with thresholds, Globex by the day pro rata. One function must produce a defensible draft for
each, with the rounding rule written on it and no invoice number anywhere.

Scope boundaries:

- **In**: rounding (none / nearest / up; session / day / total), the three modes, the one-day cap,
  the all-clients-day warning, the draft, the annex, CSV / PDF-ready / JSON exports, period locking.
- **Out**: invoice numbering, legal archiving, transmission, VAT computation rules (the tax rate is
  typed by the user), payment, Factur-X (HEU-F-28 is optional and out of the minimal scope).

---

## Requirements

### Requirement 1 — HEU-F-23 (I): the draft uses confirmed blocks only

**User Story:** As Sofia, I want the draft to contain only what I have validated, so that I never
bill a block I have not looked at.

#### Acceptance Criteria

1. WHEN a draft is computed for a client and a period, THE SYSTEM SHALL include only blocks with
   `status === 'confirmed'` and matching `clientId` and period.
2. THE SYSTEM SHALL exclude `proposed`, `conflict`, `rejected` blocks, contributing zero minutes in
   every mode.
3. THE SYSTEM SHALL group lines by project, with `projectId: null` for unassigned work.
4. THE SYSTEM SHALL expose the rounding rule on the draft (`roundingRule`) and a human-readable
   `roundingNote`.
5. WHEN no confirmed block exists in the period, THE SYSTEM SHALL return a draft with zero lines and
   `subtotalCents: 0`, not an error.

#### Scenario: proposed blocks are ignored

- **GIVEN** 3 confirmed blocks totalling 9.5 days and 4 proposed blocks for Acme
- **WHEN** the draft is computed
- **THEN** only the confirmed blocks contribute
- **AND** `lines[].evidenceCount` counts only confirmed evidence

#### Scenario: empty period

- **GIVEN** a period with no confirmed block
- **WHEN** the draft is computed
- **THEN** `lines` is empty, `subtotalCents` is 0, `draftLabel` is `'Draft'`

### Requirement 2 — HEU-F-24 (I): the three billing modes

**User Story:** As Sofia, I want hourly, daily-threshold and daily-proportional billing, so that each
client is billed the way we agreed.

#### Acceptance Criteria

1. WHEN the client's mode is `hourly`, THE SYSTEM SHALL sum the confirmed durations, rounded per the
   client's rule, and multiply by `rateCents / 60` per minute, in integer cents.
2. WHEN the mode is `daily-thresholds`, THE SYSTEM SHALL count, per day and per client, one day when
   the total reaches `settings.fullDayFromMinutes` (default 360), half a day when it reaches
   `settings.halfDayFromMinutes` (default 150), and zero below, and multiply by `dayRateCents`.
3. WHEN the mode is `daily-proportional`, THE SYSTEM SHALL divide the day's minutes by
   `settings.dayLengthMinutes` (default 420) and cap the ratio at 1.
4. THE SYSTEM SHALL round money half-up to the cent at the end of each line, never per block.
5. THE SYSTEM SHALL return the quantity in minutes (`quantityMinutes`) and the amount in cents
   (`amountCents`) so the UI can explain the figure.

#### Scenario: hourly client

- **GIVEN** Acme at €65/h, 570 confirmed minutes, rounding nearest 15 per day
- **WHEN** the draft is computed
- **THEN** the line quantity is 570 minutes (9 h 30) and `amountCents` is 61 750

#### Scenario: threshold client, three days

- **GIVEN** Northwind at €520/day, days of 400, 200 and 60 minutes
- **WHEN** the draft is computed
- **THEN** the quantities are 1, 0.5 and 0 days
- **AND** `amountCents` is 780 × 100 = 78 000

#### Scenario: proportional client capped

- **GIVEN** Globex, `dayLengthMinutes = 420`, a day with 600 confirmed minutes
- **WHEN** the draft is computed
- **THEN** the day counts as 1.0 day, not 1.43

### Requirement 3 — HEU-F-24 (I), HEU-P-08 (I): rounding is explicit and idempotent

**User Story:** As Sofia, I want to know exactly how my minutes were rounded, so that a client
question has an answer.

#### Acceptance Criteria

1. WHEN the rule mode is `none`, THE SYSTEM SHALL return the raw minutes unchanged.
2. WHEN the mode is `nearest`, THE SYSTEM SHALL round to the nearest `stepMinutes`, ties going up.
3. WHEN the mode is `up`, THE SYSTEM SHALL return the smallest multiple of `stepMinutes` at or above
   the raw minutes.
4. WHEN the scope is `session`, THE SYSTEM SHALL round each session's minutes before summing; `day`
   rounds each day's total; `total` rounds once at the end.
5. THE SYSTEM SHALL guarantee `roundUp(x) >= x` for every input, and
   `round(round(x)) === round(x)` for every mode and scope (HEU-P-08).
6. THE SYSTEM SHALL NOT round a duration of 0 up to a step: zero stays zero.

#### Scenario: 13 minutes at a quarter-hour, nearest

- **GIVEN** 13 minutes, `{ mode: 'nearest', stepMinutes: 15 }`
- **WHEN** rounded
- **THEN** the result is 15

#### Scenario: 7 minutes at a quarter-hour, nearest

- **GIVEN** 7 minutes, `{ mode: 'nearest', stepMinutes: 15 }`
- **WHEN** rounded
- **THEN** the result is 0

#### Scenario: rounding up twice changes nothing

- **GIVEN** 61 minutes, `{ mode: 'up', stepMinutes: 15 }`
- **WHEN** rounded twice
- **THEN** both results are 75

### Requirement 4 — HEU-F-24 (I), HEU-P-10 (I): daily thresholds are 0, 0.5 or 1

**User Story:** As Sofia, I want a day to be worth at most one day, so that a long Tuesday does not
become two.

#### Acceptance Criteria

1. WHEN the mode is `daily-thresholds`, THE SYSTEM SHALL return a quantity of exactly 0, 0.5 or 1 for
   each day and client.
2. THE SYSTEM SHALL NOT return a value between the thresholds or above 1 for a single day.
3. THE SYSTEM SHALL apply the thresholds to the day's total **after** rounding when the scope is
   `day`, and before rounding otherwise.

#### Scenario: property on generated days

- **GIVEN** any day total in minutes
- **WHEN** the threshold quantity is computed
- **THEN** the result is in `{0, 0.5, 1}`

### Requirement 5 — HEU-F-23 (I), HEU-F-25 (I): the draft is a draft

**User Story:** As Sofia, I want it to be impossible to mistake the output for a real invoice, so
that I never send a draft by accident.

#### Acceptance Criteria

1. THE SYSTEM SHALL set `draftLabel: 'Draft'` on every draft, in every mode.
2. THE SYSTEM SHALL NOT include any invoice number, sequence, or "final" wording in the type or the
   output.
3. THE SYSTEM SHALL include the issuer name, the client name, the period, the lines, the tax rate
   typed by the user, the free-text notes and the rounding note.
4. THE SYSTEM SHALL compute `subtotalCents`, `taxCents` and `totalCents` in integer cents.
5. THE SYSTEM SHALL NOT invent a tax rate: absent input means 0.

#### Scenario: tax is user-typed

- **GIVEN** a subtotal of 100 000 cents and `taxRateBp = 2000`
- **WHEN** the draft is computed
- **THEN** `taxCents` is 20 000 and `totalCents` is 120 000
- **AND** the draft still says `Draft`

### Requirement 6 — HEU-F-24 (I): caps and warnings

**User Story:** As Sofia, I want the app to warn me when a day is over-full, so that I catch a
double count before sending.

#### Acceptance Criteria

1. THE SYSTEM SHALL cap a day's billed quantity at one day per client, in every mode.
2. WHEN the total of one day across all clients exceeds `settings.dayLengthMinutes`, THE SYSTEM SHALL
   emit a warning naming the day and the total.
3. WHEN rounding inflates a day above the cap, THE SYSTEM SHALL cap it and record the fact in
   `roundingNote`.
4. THE SYSTEM SHALL NOT silently discard minutes: capped minutes appear in the warning.

#### Scenario: over-full Tuesday

- **GIVEN** 300 minutes for Acme and 300 for Northwind on the same day, `dayLength = 420`
- **WHEN** the draft is computed
- **THEN** a warning says the day totals 600 minutes across clients
- **AND** each client's own quantity is unaffected

### Requirement 7 — HEU-F-26 (S): the evidence annex

**User Story:** As Sofia, I want an annex that shows my client the days behind the total, so that the
invoice is defensible without sending my commits.

#### Acceptance Criteria

1. WHEN the user asks for an annex, THE SYSTEM SHALL produce one row per day with `dayKey`,
   `minutes`, `commitCount` and `meetingTitles`.
2. WHERE the detail level is `durations`, THE SYSTEM SHALL leave `meetingTitles` empty and
   `commitCount` at 0.
3. WHERE the detail level is `with-evidence`, THE SYSTEM SHALL fill `commitCount` and the meeting
   titles.
4. THE SYSTEM SHALL NOT include commit subjects in the annex (they can be confidential).
5. THE SYSTEM SHALL sort the annex by `dayKey`.

#### Scenario: durations-only annex

- **GIVEN** a November draft and `detail: 'durations'`
- **WHEN** the annex is produced
- **THEN** each row has `minutes > 0` and `meetingTitles` is `[]`

### Requirement 8 — HEU-F-27 (I): exports

**User Story:** As Sofia, I want CSV, PDF and JSON, so that I can paste into my tool, print, or keep
the data.

#### Acceptance Criteria

1. WHEN the user exports the timesheet, THE SYSTEM SHALL produce CSV via `toCsv`/`csvCell` from core,
   with a header row and one row per block or per day.
2. WHEN the user exports the draft as PDF, THE SYSTEM SHALL rely on the browser print path
   (`window.print()` with a print stylesheet) — no PDF library.
3. WHEN the user exports JSON, THE SYSTEM SHALL serialise a `Dataset` that `parseDataset` accepts
   back.
4. THE SYSTEM SHALL NOT include any network step in an export.
5. THE SYSTEM SHALL use the same formatting helpers as the screen (`formatMinutes`, `formatMoney`).

#### Scenario: JSON round trip

- **GIVEN** a dataset with blocks, clients and one draft
- **WHEN** it is exported then parsed with `parseDataset`
- **THEN** the two datasets are deeply equal

### Requirement 9 — HEU-F-29 (I), HEU-P-09 (I): a billed period locks its blocks

**User Story:** As Sofia, I want a billed period to freeze, so that a later collection cannot change
what I already sent.

#### Acceptance Criteria

1. WHEN the user marks a period as billed, THE SYSTEM SHALL set `status: 'locked'` and `locked: true`
   on its confirmed blocks.
2. THE SYSTEM SHALL make locked blocks immutable in the editor (no confirm, adjust, split, reject).
3. THE SYSTEM SHALL recompute the draft only from locked and confirmed blocks, and the total of a
   locked period SHALL NOT change.
4. THE SYSTEM SHALL keep a record of the period billed per client.
5. THE SYSTEM SHALL guarantee `total === sum(lines)` at all times (HEU-P-09).

#### Scenario: locked period stays stable

- **GIVEN** a billed November for Acme
- **WHEN** new commits arrive and the draft is recomputed for November
- **THEN** the total is identical to the billed total

### Requirement 10 — HEU-P-09 (I): the total is the sum of the lines

**User Story:** As a developer, I want the arithmetic identity stated as a property, so that a
rounding bug cannot hide in a total.

#### Acceptance Criteria

1. THE SYSTEM SHALL guarantee `subtotalCents === sum(lines[].amountCents)`.
2. THE SYSTEM SHALL guarantee each line can be recomputed from the confirmed blocks alone.
3. THE SYSTEM SHALL guarantee `totalCents === subtotalCents + taxCents`.

#### Scenario: property on generated drafts

- **GIVEN** a generated set of clients, blocks and settings
- **WHEN** the draft is computed
- **THEN** `subtotalCents` equals the sum of the line amounts
- **AND** recomputing one line from its blocks gives the same amount

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-02 | days are computed with `dayKeyInZone` / `dayRangeInZone` in the client's zone, never by slicing an ISO string |
| HEU-N-05 | money, minutes and dates formatted with core's helpers, locale-aware |
| prudence | only confirmed blocks are billable; the rule is printed; nothing is inflated silently |

## Properties owned by this spec

**HEU-P-08** (round-up never shrinks, idempotent), **HEU-P-09** (total = sum of lines),
**HEU-P-10** (threshold day quantity ∈ {0, 0.5, 1}).
