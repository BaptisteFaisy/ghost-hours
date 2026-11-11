# Requirements — `intervals`

Feature: pure interval algebra over half-open instant ranges (cahier D.10, module `intervals`).
Owner package: `packages/intervals`. Covers properties **HEU-P-01** and **HEU-P-02**.
Path chosen: **requirements first** — and this is also the feature used for the
"spec vs vibe coding" comparison in the journal (D.13).

## Introduction

Every other package asks the same four questions about time ranges: do they overlap, what is their
union, what is left of one when the other is removed, and how do I cut a range at given points.
Getting these four wrong once produces double billing (O3), which is the one thing the product
promises never to do.

This package is **pure**: no `Date`, no zone, no I/O. It works on `{ start, end }` in epoch
milliseconds, half-open: `[start, end)`.

Scope boundaries:

- **In**: normalise, merge, union, intersection, difference, split at points, clip to a range,
  total duration, containment, coverage of a set of points, "free gaps".
- **Out**: time zone conversion (core), block construction (sessionizer), rounding (billing).

---

## Requirements

### Requirement 1 — HEU-P-01 (I): overlapping ranges never survive a normalisation

**User Story:** As Sofia, I want the app to guarantee that no two blocks claim the same minute, so
that I can never bill a client twice for the same work.

#### Acceptance Criteria

1. WHEN two ranges of the same client overlap or touch, THE SYSTEM SHALL merge them into a single
   range in `normalize()`.
2. WHEN `normalize()` returns, THE SYSTEM SHALL guarantee that no two returned ranges overlap and
   that they are sorted by `start`.
3. WHEN a range has `end <= start`, THE SYSTEM SHALL drop it rather than keep an empty or inverted
   range.
4. THE SYSTEM SHALL treat ranges as half-open, so that `a.end === b.start` is **not** an overlap.
5. IF two ranges are identical, THEN THE SYSTEM SHALL keep exactly one.

#### Scenario: touching ranges merge

- **GIVEN** `[{9:00, 11:00}, {11:00, 12:00}]`
- **WHEN** `normalize()` is called
- **THEN** the result is `[{9:00, 12:00}]`

#### Scenario: inverted range is dropped

- **GIVEN** `[{10:00, 9:00}, {8:00, 9:00}]`
- **WHEN** `normalize()` is called
- **THEN** the result is `[{8:00, 9:00}]`

#### Scenario: the property holds on generated input

- **GIVEN** any array of ranges produced by the generator
- **WHEN** `normalize()` is called
- **THEN** for every pair `(i, j)`, `i < j`, `ranges[i].end <= ranges[j].start`
- **AND** the total duration is unchanged (`duration(normalize(x)) === duration(union(x))`)

### Requirement 2 — HEU-P-02 (I): a day's blocks equal their union and never exceed the day

**User Story:** As Sofia, I want the hours of a day to add up to what I actually worked, so that my
timesheet does not contain more hours than the day has.

#### Acceptance Criteria

1. WHEN several ranges belong to the same day, THE SYSTEM SHALL compute the total duration as the
   duration of their union, not as the sum of the raw ranges.
2. THE SYSTEM SHALL NOT return a total duration greater than the duration of the containing day.
3. WHEN ranges are clipped to a day, THE SYSTEM SHALL keep only the part inside the day and drop
   ranges entirely outside it.
4. THE SYSTEM SHALL compute durations in whole milliseconds, and expose minutes via
   `msToWholeMinutes` from core.

#### Scenario: two overlapping blocks in one day

- **GIVEN** `[{9:00, 12:00}, {11:00, 14:00}]` inside a day `[00:00, 24:00)`
- **WHEN** the total duration is computed
- **THEN** it is 5 h, not 6 h
- **AND** it is below the 24 h day length

#### Scenario: a block crossing midnight

- **GIVEN** a range `[23:30, 00:30)` and a day `[00:00, 24:00)`
- **WHEN** `clipTo(range, day)` is called
- **THEN** the result is `[23:30, 24:00)`
- **AND** the part after midnight belongs to the next day's call

### Requirement 3 — union, intersection, difference are total functions

**User Story:** As a developer, I want the algebra to never throw on empty or disjoint input, so that
the reconstruction does not need defensive branches everywhere.

#### Acceptance Criteria

1. WHEN `union(a, b)` is called with disjoint ranges, THE SYSTEM SHALL return both, sorted.
2. WHEN `intersection(a, b)` is called with disjoint ranges, THE SYSTEM SHALL return `[]`.
3. WHEN `difference(a, b)` is called with `b` entirely inside `a`, THE SYSTEM SHALL return two
   ranges (left and right).
4. WHEN `difference(a, b)` is called with `b` covering `a`, THE SYSTEM SHALL return `[]`.
5. WHEN any function receives an empty array, THE SYSTEM SHALL return an empty array (or the other
   operand for `union`/`difference`), never throw.

#### Scenario: difference splits a session

- **GIVEN** `a = [9:00, 17:00)`, `b = [11:00, 11:30)`
- **WHEN** `difference(a, b)` is called
- **THEN** the result is `[[9:00, 11:00), [11:30, 17:00)]`

#### Scenario: difference removes the tail

- **GIVEN** `a = [9:00, 17:00)`, `b = [16:00, 18:00)`
- **WHEN** `difference(a, b)` is called
- **THEN** the result is `[[9:00, 16:00)]`

### Requirement 4 — splitting and coverage

**User Story:** As Malik, whose half-day is meetings, I want to know which parts of a session are
covered by evidence and which are assumed, so that the app can show what is proven.

#### Acceptance Criteria

1. WHEN `splitAt(range, points)` is called, THE SYSTEM SHALL cut the range at every point strictly
   inside it and return the pieces in order.
2. WHEN `coveredMs(range, covering)` is called, THE SYSTEM SHALL return the total duration of the
   intersection of `range` with the union of `covering`.
3. WHEN `gaps(day, ranges)` is called, THE SYSTEM SHALL return the complement of `normalize(ranges)`
   inside `day`, sorted.
4. THE SYSTEM SHALL NOT return a zero-length piece from `splitAt` or `gaps`.

#### Scenario: proven share of a session

- **GIVEN** a block `[13:45, 16:40)` and covering evidence `[[14:02, 16:40)]`
- **WHEN** `coveredMs(block, covering)` is called
- **THEN** the result is 158 minutes
- **AND** the proven share is `158 / 175 ≈ 0.90` → confidence `solid` (threshold 0.8)

#### Scenario: free time in a day

- **GIVEN** a day `[7:00, 19:00)` and blocks `[[9:00, 12:00), [14:00, 17:00)]`
- **WHEN** `gaps(day, blocks)` is called
- **THEN** the result is `[[7:00, 9:00), [12:00, 14:00), [17:00, 19:00)]`

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-02 | instants only; this package never sees a zone and never converts one |
| HEU-N-03 | 5 000 ranges normalised in under 50 ms (measured, `TODO(measure)` until then) |
| — | no dependency at all: pure TypeScript over numbers |

## Properties owned by this spec

- **HEU-P-01** — no two proposed or confirmed blocks overlap.
- **HEU-P-02** — the total duration of a day's blocks equals their union and never exceeds the day.
