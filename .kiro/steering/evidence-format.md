---
inclusion: fileMatch
fileMatchPattern: "packages/collector/**"
---

# Ghost Hours — evidence file format (D.10)

`packages/collector` is the only thing that writes `evidence.json`. It is the seam between the
user's machine and the app: read-only on one side, a plain JSON file on the other.

## Read-only guarantee (HEU-N-07, HEU-F-01)

The collector **never writes inside a repository**. Allowed commands are the read-only subset:

```
git -C <path> rev-parse --show-toplevel
git -C <path> rev-parse --is-inside-work-tree
git -C <path> config --get remote.origin.url
git -C <path> log --all --author=<email> --date=iso-strict --pretty=… --numstat
git -C <path> reflog show --all --date=iso-strict
```

Forbidden: `checkout`, `fetch`, `pull`, `gc`, `prune`, `config` writes, `stash`, `reset`,
`update-ref`, `commit-graph write`, anything that takes a lock. Run `git` with
`-c core.fsmonitor=false` and never spawn a long-lived process.

The acceptance test proves it: hash the repository state (`git rev-parse HEAD`, list of refs,
`git status --porcelain`) before and after a collection run; both must be identical.

## Deterministic ids

Ids come from `@ghost-hours/core/ids.ts` and are pure functions of their inputs, so re-importing
the same evidence is a no-op (HEU-F-06, HEU-P-14):

| Kind | Function | Shape |
|---|---|---|
| commit | `commitEvidenceId(repo, sha)` | `git:acme-api:3ab91c0` |
| checkout | `checkoutEvidenceId(repo, at, to)` | `git:acme-api:reflog:0042` |
| meeting | `meetingEvidenceId(uid, start)` | `cal:…` |
| note | `noteEvidenceId(file, line, at)` | `note:2026-11-03.md:12` |
| manual | `manualEvidenceId(start, end)` | `manual:…` |

Never `Math.random()`, never `Date.now()` in an id. The reflog index is the position in the
`git reflog` output for that ref, not a counter kept across runs.

## Envelope

```json
{
  "version": 1,
  "collected_at": "2026-11-30T18:02:11+01:00",
  "generator": "ghost-hours-collector/0.1.0",
  "timeZone": "Europe/Paris",
  "repos": [
    { "path": "/home/sofia/code/acme-api", "name": "acme-api",
      "remote": "example.com/acme/api", "commitCount": 128, "reflogEntries": 42 }
  ],
  "items": [ … ]
}
```

- `version` is `EVIDENCE_FILE_VERSION` (1). The reader rejects anything else.
- `collected_at` is an ISO-8601 string **with its original offset** — never `Z` if the machine is
  not in UTC; the offset is information.
- Instants on the wire are ISO-8601 strings with offset. Inside the app they are epoch
  milliseconds; `parseEvidenceFile` / `serializeEvidenceFile` do the conversion, nothing else does.

## Items

Two shapes: **point evidence** uses `at`, **span evidence** uses `start`/`end`.

```json
{ "id": "git:acme-api:3ab91c0", "source": "git", "kind": "commit",
  "at": "2026-11-03T16:41:07+01:00", "repo": "acme-api",
  "remote": "example.com/acme/api", "branch": "feat/export",
  "summary": "Add CSV export", "added": 120, "deleted": 14,
  "authorEmail": "sofia@example.com" }
```

```json
{ "id": "git:acme-api:reflog:0042", "source": "git", "kind": "checkout",
  "at": "2026-11-03T14:05:52+01:00", "repo": "acme-api",
  "from": "main", "to": "feat/export" }
```

```json
{ "id": "cal:9f2b@example.org", "source": "calendar", "kind": "meeting",
  "start": "2026-11-05T11:00:00+01:00", "end": "2026-11-05T11:30:00+01:00",
  "title": "Weekly sync", "organizerEmail": "malik@example.org",
  "attendees": [{ "email": "sofia@example.com", "partStat": "accepted" }],
  "status": "confirmed", "timeZone": "Europe/Paris", "recurring": false }
```

Field rules:

- `source` ∈ `git | calendar | note | manual`; `kind` ∈ `commit | checkout | meeting | note | manual`.
- `clientId` is **absent** from a collected file: association happens in the app (HEU-F-08), not in
  the collector. Writing a `clientId` here would freeze a rule that the user may change.
- `summary` is included **only** when `--no-summaries` is not passed: commit subjects can be
  confidential (D.18 question 3), so the option must exist and must be documented.
- Unknown fields are allowed (`.passthrough()`), but never invent one: the schema in
  `packages/core/src/wire.ts` is the contract.
- `raw` holds the untouched original when a source gives more than the model needs. It is not read
  by the domain.

## Errors

- A missing repository is skipped and listed in the report; it never aborts the run.
- An unparsable commit line is skipped and counted; the count is printed.
- If **no** repository is found, exit code 1 with a one-line message.
- The collector writes to a temp file then renames, so an interrupted run never leaves a truncated
  `evidence.json`.

## Privacy

The written file contains real names, real emails and real commit subjects. It is gitignored at the
repository root and listed in `.kiroignore`. Never attach it to a spec, a test or a journal entry;
never read it with the agent. Tests use `fixtures/sample-month/evidence.json` only.
