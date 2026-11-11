# Requirements — `review-ui`

Feature: the review screens — month counter, week grid, block evidence panel (cahier D.7, D.11).
Owner: `apps/web`. Covers **HEU-F-18** … **HEU-F-22**, plus HEU-N-04 (accessibility) and HEU-N-05
(i18n) as they apply to these screens.
Path chosen: **design first** (D.13) — here the shape of the interaction is the hard part, and the
requirements follow from the art direction and from what a keyboard user must be able to do.

## Introduction

Sofia has fifteen minutes (O1). In that time she must see the month's ghost hours, walk a week of
blocks, confirm most of them in one gesture, fix a few lead-ins, and decide a conflict. Everything on
these screens serves that.

Scope boundaries:

- **In**: month screen (counter, load per day, clients), week screen (block grid, gestures,
  confidence display), evidence panel of a block, empty / error / loading states, keyboard operation,
  the equivalent table, i18n en/fr.
- **Out**: the clients and rules screen (HEU-F-07 … F-09, separate work), the invoice screen
  (HEU-F-23 …), settings.

---

## Requirements

### Requirement 1 — HEU-F-18 (I): the week shows three distinct aspects, without colour alone

**User Story:** As Sofia, I want to tell at a glance which blocks are proposed, confirmed or in
conflict, so that I know where to spend my review time.

#### Acceptance Criteria

1. WHEN a week is displayed, THE SYSTEM SHALL render proposed blocks translucent with a dashed
   border, confirmed blocks solid, and conflict blocks hatched.
2. THE SYSTEM SHALL distinguish the three aspects by at least three means: fill opacity, border
   style, and an explicit text label inside the block (`Proposed`, `Confirmed`, `Conflict`).
3. THE SYSTEM SHALL render the assumed part of a block in a paler tone than its proven part, with a
   text equivalent available (the proven share is in the block panel and in the table).
4. THE SYSTEM SHALL NOT rely on hue alone to carry any of this information.
5. WHEN `prefers-reduced-motion: reduce` is set, THE SYSTEM SHALL NOT animate the confirm transition.

#### Scenario: three blocks, three aspects

- **GIVEN** one proposed, one confirmed and one conflict block in the same day
- **WHEN** the week is rendered
- **THEN** each carries its own border style and its own text label
- **AND** a grayscale screenshot still distinguishes them

#### Scenario: reduced motion

- **GIVEN** the user has `prefers-reduced-motion: reduce`
- **WHEN** a block is confirmed
- **THEN** the state changes with no transition

### Requirement 2 — HEU-F-19 (I): gestures to confirm, adjust, split, reassign, reject

**User Story:** As Sofia, I want to confirm a whole day in one gesture and fix a single edge in
another, so that a month takes minutes, not hours.

#### Acceptance Criteria

1. WHEN the user confirms a block, THE SYSTEM SHALL set `status: 'confirmed'` and persist it.
2. WHEN the user adjusts an edge, THE SYSTEM SHALL move the start or the end, keep the block's
   evidence, and record the adjustment (`adjusted: true`) and the observed lead-in for calibration.
3. WHEN the user splits a block, THE SYSTEM SHALL produce two blocks with derived ids and the
   evidence distributed by instant.
4. WHEN the user changes a block's client, THE SYSTEM SHALL move the block and its evidence, and
   re-check overlaps (HEU-P-01).
5. WHEN the user rejects a block, THE SYSTEM SHALL set `status: 'rejected'`, keep it visible in a
   "rejected" list, and never bill it.
6. WHEN the user confirms a whole day or a whole week, THE SYSTEM SHALL confirm every proposed block
   in that range in one action, and report how many were confirmed.
7. WHEN a block is `locked`, THE SYSTEM SHALL refuse every gesture with an explanation.

#### Scenario: confirm a whole day

- **GIVEN** Monday with four proposed blocks
- **WHEN** the user confirms the day
- **THEN** all four become `confirmed`
- **AND** the counter updates immediately

#### Scenario: adjust a lead-in

- **GIVEN** a block starting at 13:45 with a 17-minute assumed lead-in
- **WHEN** the user moves the start to 13:55
- **THEN** `assumedLeadInMinutes` becomes 7 and `adjusted: true`
- **AND** the observed lead-in is recorded for calibration (HEU-F-17)

### Requirement 3 — HEU-F-20 (I): the evidence panel of a block

**User Story:** As Sofia, I want to open a block and see the commits, meetings and notes behind it, so
that I can defend the hours to a client.

#### Acceptance Criteria

1. WHEN the user opens a block, THE SYSTEM SHALL list every evidence item attached to it, grouped by
   source, sorted by instant.
2. THE SYSTEM SHALL show, for a commit, the time, the repository, the branch and the subject; for a
   meeting, the time, the title and the attendees count; for a note, the file and the line.
3. WHEN an evidence item has no client, THE SYSTEM SHALL say so instead of hiding it.
4. THE SYSTEM SHALL show the block's proven share and assumed lead-in in the panel.
5. THE SYSTEM SHALL close the panel with `Escape` and return focus to the block that opened it.

#### Scenario: the 13:45 block

- **GIVEN** a block with three commits, one checkout and one meeting
- **WHEN** the panel opens
- **THEN** five items are listed, grouped by source
- **AND** the panel shows `90 % proven`, `17 min assumed`

### Requirement 4 — HEU-F-21 (I): the month counter

**User Story:** As Sofia, I want to see found, confirmed and ghost hours in one place, so that the
number I care about is the first thing on screen.

#### Acceptance Criteria

1. WHEN the month screen loads, THE SYSTEM SHALL display, per month and per client, the found minutes,
   the confirmed minutes and, when the user has entered declared hours, the gap in hours and in money.
2. THE SYSTEM SHALL compute the gap as `declared - found` and show it as ghost hours when positive.
3. THE SYSTEM SHALL label the money figure as a potential (`≈`), never as earned.
4. WHEN declared hours are absent, THE SYSTEM SHALL show an input inviting them, not a zero.
5. THE SYSTEM SHALL update the counter immediately after a confirmation, announcing the change in an
   `aria-live="polite"` region.

#### Scenario: the demo month

- **GIVEN** the sample month with 104 h found and 92 h declared
- **WHEN** the month screen loads
- **THEN** it shows `104 h found`, `0 h confirmed`, and after entering 92 h, `12 h ghost` and
  `≈ €780`

### Requirement 5 — HEU-F-22 (S): the month view shows the load per day

**User Story:** As Sofia, I want to see the shape of my month, so that I spot the empty weeks and the
over-full days.

#### Acceptance Criteria

1. WHEN the month view is displayed, THE SYSTEM SHALL render one cell per day with its total minutes
   and its client composition.
2. THE SYSTEM SHALL mark days above `dayLengthMinutes` distinctly, with a text label.
3. THE SYSTEM SHALL link each day to the week view positioned on that day.

#### Scenario: an over-full day

- **GIVEN** a day with 600 minutes across two clients, `dayLength = 420`
- **WHEN** the month view renders
- **THEN** the cell carries an "over" label, not only a colour

### Requirement 6 — HEU-N-04 (I): keyboard and an equivalent table

**User Story:** As a keyboard-only user, I want to do everything the mouse can do, and as a screen
reader user I want the same information in a table.

#### Acceptance Criteria

1. WHEN the week grid has focus, THE SYSTEM SHALL move between slots with the arrow keys.
2. THE SYSTEM SHALL open a block with `Enter`, confirm with `Space`, and close the panel with
   `Escape`.
3. THE SYSTEM SHALL provide every drag gesture as a keyboard command and as a button in the panel.
4. THE SYSTEM SHALL provide an equivalent `<table>` of the week — one row per block with start, end,
   client, project, status, proven share and evidence count — reachable by a link above the grid.
5. THE SYSTEM SHALL keep a visible focus ring everywhere (`:focus-visible`, never removed without a
   replacement).
6. THE SYSTEM SHALL use semantic landmarks (`main`, `nav`, `aside`) and one `h1` per screen.
7. WHEN jsx-a11y reports a violation, THE SYSTEM SHALL fail `pnpm lint`.

#### Scenario: keyboard-only review

- **GIVEN** a keyboard-only user on the week screen
- **WHEN** they press `Tab`, arrows, `Enter`, `Space` and `Escape`
- **THEN** they can select, open and confirm a block without a mouse
- **AND** focus is always visible

#### Scenario: the equivalent table

- **GIVEN** a week with six blocks
- **WHEN** the user follows the "view as table" link
- **THEN** a table with six rows is rendered
- **AND** each row's status is text, not a colour swatch

### Requirement 7 — HEU-N-05 (I): English and French

**User Story:** As a French freelancer, I want the interface in French, and as a judge I want it in
English by default.

#### Acceptance Criteria

1. WHEN the app starts without a stored preference, THE SYSTEM SHALL use English.
2. WHEN the user selects French, THE SYSTEM SHALL render every string from the French dictionary.
3. THE SYSTEM SHALL NOT contain a user-visible string outside a dictionary.
4. THE SYSTEM SHALL format money, dates and durations with core's helpers for the active locale
   (24-hour clock, locale-appropriate money format).

#### Scenario: switching language

- **GIVEN** the app in English on the week screen
- **WHEN** the user switches to French in settings
- **THEN** every label, button and status changes
- **AND** no English fragment remains

### Requirement 8 — states (Design criterion)

**User Story:** As a judge, I want the app to look finished even before I load data, so that I trust
it.

#### Acceptance Criteria

1. WHEN no dataset is loaded, THE SYSTEM SHALL show an empty state with the one-click
   *Load the sample month* action (HEU-F-30) and one sentence of explanation.
2. WHEN a file fails to parse, THE SYSTEM SHALL show the error, the file name, and a way to retry,
   with the raw message behind a disclosure.
3. WHEN parsing a large file, THE SYSTEM SHALL show progress feedback (file parsing only — there is
   no network).
4. THE SYSTEM SHALL NOT display a spinner for a request: there are none.

#### Scenario: first visit

- **GIVEN** a fresh browser with no stored dataset
- **WHEN** the app loads
- **THEN** an empty state explains the product in one sentence
- **AND** one button loads the sample month

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-01 | no network request after load; no remote font, icon CDN or analytics |
| HEU-N-04 | AA contrast, keyboard operation, three non-colour aspects, equivalent table, reduced motion |
| HEU-N-05 | English default, French complete, locale-aware formatting |
| HEU-N-03 | a 5 000-block week renders in under 300 ms (`TODO(measure)`) |

## Properties re-asserted here

- **HEU-P-01** — asserted on the rendered model before paint: if two blocks overlap, the screen
  refuses to render and shows a diagnostic instead of a wrong picture.
