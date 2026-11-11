# Requirements — `sessionizer`

Feature: the reconstruction algorithm of D.5 — turn evidence into proposed time blocks.
Owner package: `packages/sessionizer`.
Covers **HEU-F-11** … **HEU-F-17** and properties **HEU-P-03** … **HEU-P-07**, **HEU-P-13**.
Path chosen: **requirements first**, with D.5 as the input document (D.13).

## Introduction

This is the heart of the product: nine steps that turn a pile of evidence into blocks a human can
confirm in a quarter of an hour (O1). Every step is bounded, every assumption is named, and the
result depends only on the evidence and the settings — never on the order in which the evidence
arrived.

Scope boundaries:

- **In**: sessions from Git evidence, session start resolution, meetings as exact blocks, overlap
  resolution, merging, confidence, conflicts, locked-block preservation, calibration proposal.
- **Out**: client association (`mapping`), rendering (`apps/web`), billing (`billing`), reading
  sources (`collector`, `ics`, `notes`).

---

## Requirements

### Requirement 1 — HEU-F-11 (I): group Git evidence into sessions by `gapMax`

**User Story:** As Sofia, I want my commits grouped into work sessions, so that I see "Tuesday
afternoon" instead of forty individual commits.

#### Acceptance Criteria

1. WHEN evidence of one client is sorted by instant, THE SYSTEM SHALL start a new session whenever
   the gap between two consecutive Git evidence exceeds `settings.gapMaxMinutes`.
2. WHEN the gap is exactly `gapMaxMinutes`, THE SYSTEM SHALL keep both in the same session.
3. THE SYSTEM SHALL group per client: evidence of two clients never shares a session.
4. WHEN a session's computed duration is below `settings.minSessionMinutes`, THE SYSTEM SHALL drop it
   and list its evidence as orphans.
5. THE SYSTEM SHALL consider Git evidence only (`kind: 'commit'` and `kind: 'checkout'`) for
   session cutting; meetings and notes never cut a session.

#### Scenario: two sessions in one afternoon

- **GIVEN** commits at 14:02, 14:40, 16:38 and 18:20 for Acme, `gapMax = 90`
- **WHEN** sessions are built
- **THEN** the first three form one session and the last one forms a second

#### Scenario: gap exactly at the limit

- **GIVEN** commits 90 minutes apart, `gapMax = 90`
- **WHEN** sessions are built
- **THEN** they belong to the same session

### Requirement 2 — HEU-F-12 (I): session start is proven when possible, assumed otherwise

**User Story:** As Sofia, I want the app to use my branch switch as the real start of the session,
and to tell me when it had to guess, so that I can correct only the guesses.

#### Acceptance Criteria

1. WHEN a checkout of the same repository exists within `settings.leadInMaxMinutes` before the first
   evidence of the session, and it is later than the previous evidence of **any** client, THE SYSTEM
   SHALL use it as the session start.
2. WHEN no such checkout exists, THE SYSTEM SHALL use the first evidence minus
   `settings.leadInDefaultMinutes`.
3. THE SYSTEM SHALL NOT place a session start before the previous evidence (any client) nor before
   `workdayStart` on that day, in `settings.timeZone`.
4. WHEN the start comes from an assumption, THE SYSTEM SHALL set `assumedLeadInMinutes` to the number
   of minutes added and mark the block's origin accordingly.
5. WHEN the start comes from a checkout, THE SYSTEM SHALL set `assumedLeadInMinutes` to 0.
6. WHEN the clamp leaves no room (the first evidence is already at or before `workdayStart`), THE
   SYSTEM SHALL start at the first evidence and set `assumedLeadInMinutes` to 0.

#### Scenario: branch switch wins

- **GIVEN** a checkout to `feat/export` at 13:51 and a first commit at 14:02, previous evidence at
  11:30, `leadInMax = 120`
- **WHEN** the session start is resolved
- **THEN** the block starts at 13:51 with `assumedLeadInMinutes: 0`

#### Scenario: default lead-in, clamped

- **GIVEN** no checkout, a first commit at 07:10, `leadInDefault = 30`, `workdayStart = '07:00'`
- **WHEN** the session start is resolved
- **THEN** the block starts at 07:00 with `assumedLeadInMinutes: 10`

#### Scenario: never before the previous evidence

- **GIVEN** previous evidence at 14:00 and a first commit at 14:10, `leadInDefault = 30`
- **WHEN** the session start is resolved
- **THEN** the block starts at 14:00, not 13:40

### Requirement 3 — HEU-F-13 (I): each retained meeting is an exact block

**User Story:** As Malik, I want a meeting to become a block with its real start and end, so that my
meeting time is proven, not estimated.

#### Acceptance Criteria

1. WHEN a calendar evidence item is retained (it has a client), THE SYSTEM SHALL create one block
   with `origin: 'meeting'`, `start` and `end` from the evidence, and `assumedLeadInMinutes: 0`.
2. THE SYSTEM SHALL set `provenShare: 1` for a meeting block.
3. THE SYSTEM SHALL NOT merge two meetings of different clients.
4. WHEN two meetings of the same client overlap, THE SYSTEM SHALL merge them into one block with
   `origin: 'merged'`.

#### Scenario: weekly sync

- **GIVEN** a 11:00–11:30 meeting for Acme
- **WHEN** blocks are built
- **THEN** one block 11:00–11:30, `origin: 'meeting'`, `provenShare: 1`, `confidence: 'solid'`

### Requirement 4 — HEU-F-14 (I): no two proposed or confirmed blocks overlap; contradictions become conflicts

**User Story:** As Sofia, I want the app to refuse to let me bill the same minute twice, and to ask
me when two sources disagree instead of guessing.

#### Acceptance Criteria

1. WHEN a meeting of one client overlaps a Git session of another client, THE SYSTEM SHALL trim or
   split the Git session around the meeting, because the meeting has known bounds and the lead-in is
   assumed.
2. WHEN a meeting of one client overlaps a Git session of the same client, THE SYSTEM SHALL merge
   them into one block.
3. IF Git commits of one client fall inside a meeting of another client, THEN THE SYSTEM SHALL create
   a `Conflict` listing the blocks and the evidence, and shall not silently choose a side.
4. THE SYSTEM SHALL guarantee that the returned `blocks` contain no pair with overlapping spans for
   the same or different clients (HEU-P-01).
5. WHEN a conflict is resolved by the user, THE SYSTEM SHALL apply the decision and mark it
   `resolved: true`, keeping the record.
6. THE SYSTEM SHALL keep the evidence of a conflict attached to both sides, so the panel can show it.

#### Scenario: meeting trims another client's session

- **GIVEN** a Globex session 09:00–12:00 (assumed from 08:30) and an Acme meeting 11:00–11:30
- **WHEN** overlaps are resolved
- **THEN** the Globex block becomes 09:00–11:00 and 11:30–12:00
- **AND** the Acme meeting stays 11:00–11:30
- **AND** no pair overlaps

#### Scenario: commits during another client's meeting

- **GIVEN** an Acme meeting 11:00–11:30 and Northwind commits at 11:05 and 11:20
- **WHEN** overlaps are resolved
- **THEN** one `Conflict` is created with `reason: 'commits during another client's meeting'`
- **AND** neither side is discarded

### Requirement 5 — HEU-F-15 (I): proven share and confidence

**User Story:** As Sofia, I want to see at a glance which blocks are solid and which are guesses, so
that I review the guesses and skim the rest.

#### Acceptance Criteria

1. WHEN a block is built, THE SYSTEM SHALL compute `provenShare` as the duration covered by
   consecutive-evidence intervals or by agenda, divided by the block duration.
2. WHEN `provenShare >= 0.8`, THE SYSTEM SHALL set `confidence: 'solid'`.
3. WHEN `0.5 <= provenShare < 0.8`, THE SYSTEM SHALL set `confidence: 'likely'`.
4. WHEN `provenShare < 0.5`, THE SYSTEM SHALL set `confidence: 'to-confirm'`.
5. THE SYSTEM SHALL set `provenShare` to 1 for a meeting block and to 0 for a purely manual block.
6. THE SYSTEM SHALL expose `assumedLeadInMinutes` on every block, 0 when nothing was assumed.

#### Scenario: a session with a long assumed lead-in

- **GIVEN** a block 13:45–16:40 whose evidence covers 14:02–16:40
- **WHEN** confidence is computed
- **THEN** `provenShare ≈ 0.90` and `confidence: 'solid'`
- **AND** `assumedLeadInMinutes: 17`

### Requirement 6 — HEU-F-16 (I): determinism

**User Story:** As a developer, I want the same evidence to always give the same blocks, so that a
re-import never silently rewrites the user's review.

#### Acceptance Criteria

1. WHEN the same evidence and settings are reconstructed, THE SYSTEM SHALL return blocks with the
   same ids, spans and order, whatever the input order.
2. THE SYSTEM SHALL sort explicitly before any iteration that can affect output: evidence by
   `(instant, id)`, clients by id, blocks by `(start, id)`.
3. THE SYSTEM SHALL derive block ids from `blockId(start, end, clientId, origin)` and conflict ids
   from `conflictId(start, end, blockIds)`.
4. THE SYSTEM SHALL NOT depend on object key order or on `Map` insertion order.

#### Scenario: shuffled import

- **GIVEN** the same 500 evidence items in two different orders
- **WHEN** both are reconstructed
- **THEN** the two block arrays are deeply equal (HEU-P-03)

### Requirement 7 — HEU-F-17 (S): calibration proposes, never applies

**User Story:** As Sofia, I want the app to learn my usual lead-in after ten corrections, so that I
stop correcting the same thing.

#### Acceptance Criteria

1. WHEN the user has adjusted a session start at least ten times, THE SYSTEM SHALL compute the median
   of the retained lead-ins.
2. THE SYSTEM SHALL return a *proposal* with the observed median and the current default; it SHALL
   NOT change `settings` by itself.
3. WHEN the user accepts, THE SYSTEM SHALL store the median as the new `leadInDefaultMinutes`.
4. THE SYSTEM SHALL keep the raw list of observed lead-ins so the proposal can be explained.

#### Scenario: ten corrections

- **GIVEN** ten session starts adjusted by 12, 15, 18, 20, 25, 30, 30, 35, 40, 45 minutes
- **WHEN** the proposal is computed
- **THEN** the median is 27.5 minutes (average of 25 and 30)
- **AND** `settings.leadInDefaultMinutes` is still 30 until the user accepts

### Requirement 8 — HEU-P-13 (I): a new reconstruction never touches a locked block

**User Story:** As Sofia, I want a billed period to stay exactly as I billed it, so that a later
collection cannot rewrite history.

#### Acceptance Criteria

1. WHEN a block has `locked: true`, THE SYSTEM SHALL keep it unchanged: same span, same status, same
   evidence, same id.
2. THE SYSTEM SHALL treat a locked block as occupied time when resolving overlaps with new blocks.
3. WHEN new evidence falls inside a locked block, THE SYSTEM SHALL attach it to the locked block
   rather than create an overlapping one.
4. WHEN the user unlocks, THE SYSTEM SHALL include the block in the next reconstruction.

#### Scenario: locked week, new commits

- **GIVEN** a locked block 14:00–17:00 and a new commit at 15:00 for the same client
- **WHEN** the reconstruction runs again
- **THEN** the locked block is byte identical
- **AND** no new block overlaps it

### Requirement 9 — HEU-P-03 … HEU-P-07 (I): the properties this package owns

**User Story:** As a developer, I want each guarantee of the algorithm stated as a property, so that
a regression is caught by a generated case.

#### Acceptance Criteria

1. **HEU-P-03** — WHEN the same evidence is imported in a different order, THE SYSTEM SHALL produce
   the same blocks.
2. **HEU-P-04** — WHEN one evidence item is added, THE SYSTEM SHALL never decrease the total proven
   duration.
3. **HEU-P-05** — WHEN evidence has a client, THE SYSTEM SHALL cover it with a block or list it in a
   conflict or in `orphanEvidence`; nothing disappears.
4. **HEU-P-06** — WHEN a block is not `origin: 'manual'`, THE SYSTEM SHALL attach at least one
   evidence id to it.
5. **HEU-P-07** — WHEN a start is assumed, THE SYSTEM SHALL place it at or after the previous
   evidence and at or after `workdayStart`.

#### Scenario: property P-05 on generated evidence

- **GIVEN** generated evidence with a client assigned
- **WHEN** the reconstruction runs
- **THEN** every evidence id appears in a block, a conflict, or `orphanEvidence`

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-02 | every calendar computation goes through core's zone helpers; `workdayStart` is resolved in `settings.timeZone` |
| HEU-N-03 | 5 000 commits + 2 000 events reconstructed in under 2 s (`TODO(measure)`) |
| HEU-F-16 | determinism is a requirement, not a hope: explicit sorts everywhere |
| prudence | an assumption is always visible (`assumedLeadInMinutes`, `provenShare`) |

## Properties owned by this spec

**HEU-P-03**, **HEU-P-04**, **HEU-P-05**, **HEU-P-06**, **HEU-P-07**, **HEU-P-13**.
(HEU-P-01 is owned by `intervals` and re-asserted here on the produced blocks.)
