# Requirements — `collector`

Feature: read-only Git collector writing `evidence.json` (spec D.1 in the cahier).
Owner package: `packages/collector`. Covers HEU-F-01 and HEU-F-06, property HEU-P-14.
Path chosen: **requirements first** (D.13) — the contract with the user's machine is the risk, not
the code.

## Introduction

Sofia runs one command over her code folder. The collector finds her repositories, reads the commits
she authored on every ref, reads the reflog (branch switches), and writes a single `evidence.json`.
It never writes inside a repository, it never talks to the network, and running it twice on the same
history produces the same file.

Scope boundaries:

- **In**: repository discovery, commit reading, reflog reading, deterministic ids, envelope
  serialisation, a report on stderr, `--no-summaries`.
- **Out**: client association (that is `mapping`, HEU-F-08), the reconstruction (`sessionizer`),
  anything that writes to a repository, remote Git operations, GitHub/GitLab APIs.

---

## Requirements

### Requirement 1 — HEU-F-01 (I): find repositories and write evidence

**User Story:** As Sofia, I want to run one command over my code folder and get a single evidence
file, so that I do not have to list my repositories by hand.

#### Acceptance Criteria

1. WHEN the user runs the collector on one or more directories, THE SYSTEM SHALL discover every Git
   repository at or below those directories, up to the configured depth.
2. WHEN a repository is discovered, THE SYSTEM SHALL read the commits whose author email matches the
   designated author on **all** refs (`--all`), not only the current branch.
3. WHEN reading a commit, THE SYSTEM SHALL use the **author date** (`%aI`), never the committer date,
   because a rebase rewrites the latter.
4. WHEN the run completes, THE SYSTEM SHALL write one `evidence.json` whose `version` is
   `EVIDENCE_FILE_VERSION` and whose `items` contain one entry per commit and one per reflog entry.
5. WHEN the output path already exists, THE SYSTEM SHALL overwrite it atomically (write a temporary
   file in the same directory, then rename).
6. IF no repository is found under the given directories, THEN THE SYSTEM SHALL exit with code 1 and
   print one explanatory line on stderr.
7. IF a directory is not a Git repository and contains none, THEN THE SYSTEM SHALL skip it, keep
   going, and count it in the report.

#### Scenario: three repositories under one folder

- **GIVEN** `~/code/acme-api`, `~/code/northwind-portal` and `~/code/globex-etl` are Git repositories
- **WHEN** the user runs `ghost-hours collect ~/code --author sofia@example.com`
- **THEN** `evidence.json` contains a `repos` entry for each of the three and their commits
- **AND** the report on stderr says `3 repositories, 128 commits, 42 reflog entries` (or the real
  counts for that tree)

#### Scenario: nothing to collect

- **GIVEN** a folder with no Git repository
- **WHEN** the user runs the collector on it
- **THEN** the process exits with code 1
- **AND** no `evidence.json` is created

### Requirement 2 — HEU-F-01 (I): the collector never writes inside a repository

**User Story:** As Sofia, I want to be sure the tool cannot damage or modify my working copies, so
that I can run it on client code without fear.

#### Acceptance Criteria

1. THE SYSTEM SHALL only invoke Git through the read-only command subset documented in
   `steering/evidence-format.md`.
2. THE SYSTEM SHALL NOT create, modify or delete any file inside a discovered repository.
3. THE SYSTEM SHALL NOT run `git fetch`, `git pull`, `git gc`, `git prune`, `git checkout`,
   `git reset`, `git stash`, `git update-ref`, or any command taking a lock.
4. WHILE a collection run is in progress, THE SYSTEM SHALL leave `git status --porcelain` unchanged
   for every visited repository.
5. THE SYSTEM SHALL NOT open a network connection: no remote lookup, no `ls-remote`, no API call.

#### Scenario: repository state is identical before and after

- **GIVEN** a repository with a dirty working tree
- **WHEN** the collector runs over it
- **THEN** `git rev-parse HEAD`, the sorted list of refs and `git status --porcelain` are byte
  identical before and after the run
- **AND** the repository's `.git` directory has no new lock file

#### Scenario: a remote exists but is never contacted

- **GIVEN** a repository whose `origin` points at `example.com/acme/api`
- **WHEN** the collector runs with the network unavailable
- **THEN** the run succeeds and records `remote: "example.com/acme/api"` from `git config --get`
- **AND** no connection is attempted

### Requirement 3 — HEU-F-01 (I): reflog entries are collected as session starts

**User Story:** As Sofia, I want branch switches to be recorded, so that the reconstruction can find
when a work session actually started instead of guessing.

#### Acceptance Criteria

1. WHEN a repository is read, THE SYSTEM SHALL collect its reflog entries for all refs, with their
   dates in ISO-8601 strict form.
2. WHEN a reflog entry is recorded, THE SYSTEM SHALL emit evidence with `kind: "checkout"`, the
   instant in `at`, and `from`/`to` branch names when the message allows it.
3. IF the reflog is empty or unavailable, THEN THE SYSTEM SHALL continue with commits only and note
   `reflogEntries: 0` for that repository.
4. THE SYSTEM SHALL NOT depend on the reflog's default expiry: it reads what is present, no more.

#### Scenario: branch switch before the first commit

- **GIVEN** a reflog entry `checkout: moving from main to feat/export` at `2026-11-03T14:05:52+01:00`
- **WHEN** the collector writes the evidence file
- **THEN** the file contains an item `{ "kind": "checkout", "from": "main", "to": "feat/export",
  "at": "2026-11-03T14:05:52+01:00" }`
- **AND** its id is derived from `checkoutEvidenceId(repo, at, to)`

### Requirement 4 — HEU-F-06 (I): re-importing the same evidence creates no duplicate

**User Story:** As Sofia, I want to run the collector as often as I like, so that a weekly run does
not multiply my hours.

#### Acceptance Criteria

1. THE SYSTEM SHALL derive every evidence id from a pure function of stable inputs, using
   `@ghost-hours/core` (`commitEvidenceId`, `checkoutEvidenceId`).
2. WHEN two runs read the same commit, THE SYSTEM SHALL produce the same id for it.
3. WHEN the same `evidence.json` is imported twice in the app, THE SYSTEM SHALL end with the same
   state as after one import (HEU-P-14).
4. THE SYSTEM SHALL NOT use `Math.random()`, `Date.now()` or a run counter in any id.

#### Scenario: two consecutive runs

- **GIVEN** a repository whose history does not change
- **WHEN** the collector runs twice
- **THEN** both files have the same `items` array once sorted by `id`
- **AND** the only difference between the two files is `collected_at`

### Requirement 5 — HEU-N-07 (S): commit subjects are optional

**User Story:** As Sofia, I want to exclude commit subjects, so that I can collect evidence from a
client repository whose commit messages are confidential.

#### Acceptance Criteria

1. WHERE the `--no-summaries` option is passed, THE SYSTEM SHALL omit `summary` from every item.
2. WHERE the option is not passed, THE SYSTEM SHALL include the first line of the commit subject.
3. THE SYSTEM SHALL NOT include the commit body, ever.
4. THE SYSTEM SHALL document the option in `--help`.

#### Scenario: confidential repository

- **GIVEN** a repository whose commit subjects name a client project
- **WHEN** the collector runs with `--no-summaries`
- **THEN** no item in the file has a `summary` field
- **AND** every other field is present as usual

### Requirement 6 — HEU-N-06 (S): the output stays out of Git

**User Story:** As Sofia, I want the evidence file to never be committed by accident, so that real
client data cannot end up in a public repository.

#### Acceptance Criteria

1. THE SYSTEM SHALL write `evidence.json` at the path given by `--out`, defaulting to the current
   directory.
2. THE SYSTEM SHALL print, at the end of the run, the absolute path written and a reminder that the
   file must not be committed.
3. THE SYSTEM SHALL NOT write any other file.

#### Scenario: default output path

- **GIVEN** a run without `--out`
- **WHEN** the collector finishes
- **THEN** `./evidence.json` exists
- **AND** stderr ends with the absolute path and the reminder line

---

## Non-functional requirements carried by this spec

| Id | Requirement |
|---|---|
| HEU-N-07 | read-only; `--no-summaries`; no dependency beyond Git and Node.js |
| HEU-N-01 | no network call at any point |
| HEU-N-06 | the produced file is personal data: gitignored, `.kiroignore`d, never in a spec |
| HEU-N-03 | 5 000 commits collected in under 2 seconds on a warm filesystem (measured, `TODO(measure)` if not yet) |

## Properties owned by this spec

- **HEU-P-14** — re-importing the same evidence leaves the state unchanged.
