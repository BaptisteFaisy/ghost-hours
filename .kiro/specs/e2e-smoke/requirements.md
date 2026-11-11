# Requirements — `e2e-smoke`

Feature: an end-to-end smoke test that drives the **built** application in a real browser.
Owner: repository root (`e2e/`) + a dedicated workflow (`.github/workflows/e2e.yml`).
Covers **HEU-N-01** (no request after load), **HEU-N-03** (the demo month loads fast),
**HEU-F-30** (one-click sample month) and the acceptance line of D.17 about the browser log.
Path chosen: **requirements first** — the behaviour is already specified, this is about proving it
in a browser instead of in jsdom.

## Introduction

The unit and property tests prove the domain. They do not prove that the built bundle boots, that
the sample month reaches the screen, or that the page talks to nobody. A headless browser run after
each deploy closes that gap, and it doubles as the recording rig for the submission video.

Why it is not a pull-request check: a browser run needs a browser on the runner and tens of
seconds, and the verdict of a pull request must land in five minutes. It runs on `main` after a
deploy, and on demand.

## Requirements

### Requirement 1 — HEU-F-30 (I): the sample month loads with one click

**User Story:** As a judge, I want one click to load a month of data, so that I can evaluate the
product without installing anything.

#### Acceptance Criteria

1. WHEN the built app is opened at its public URL, THE SYSTEM SHALL render the empty state and a
   button labelled "Load the sample month".
2. WHEN that button is clicked, THE SYSTEM SHALL show the month counter within five seconds.
3. THE SYSTEM SHALL display 104 h found, 92 h declared, 12 ghost hours and €780.00 on the sample
   month.
4. IF the counter shows any other figure, THEN the test SHALL fail with the figures it read.

### Requirement 2 — HEU-N-01 (I): nothing leaves the browser

**User Story:** As a freelancer, I want my client evidence to stay on my machine.

#### Acceptance Criteria

1. WHEN the app is loaded and the sample month is opened, THE SYSTEM SHALL make no network request
   other than the documents of the page itself.
2. THE SYSTEM SHALL fail the test if any request is made to a host other than the one serving the
   page.
3. THE SYSTEM SHALL report the console errors found during the run, and fail if any is present.

### Requirement 3 — the reviewer path is walkable (D.7 P4 to P7)

#### Acceptance Criteria

1. WHEN the week screen is opened, THE SYSTEM SHALL show at least one proposed block and the
   contradiction of 16 November.
2. WHEN a proposed block is confirmed, THE SYSTEM SHALL show it as confirmed and increase the
   confirmed hours of the month counter.
3. WHEN the invoice screen is opened for Acme, THE SYSTEM SHALL show the word "Draft" and SHALL NOT
   show an invoice number.
4. WHEN the CSV export is clicked, THE SYSTEM SHALL produce a non-empty download without any
   network request.

### Requirement 4 — the run is reproducible and bounded

#### Acceptance Criteria

1. THE SYSTEM SHALL run the suite against a URL given by an environment variable, defaulting to the
   local preview of the built app.
2. THE SYSTEM SHALL finish in under five minutes, and SHALL be declared with `timeout-minutes: 5`.
3. THE SYSTEM SHALL attach the screenshots and the video trace as build artifacts.
4. THE SYSTEM SHALL run on `workflow_dispatch` and after a successful deploy, never on a pull
   request.
