# ADR-0005 — The decision log is a local hash chain

**Status:** Accepted — implemented with idea C-06 (`71b170f`), recorded 2026-11-12.

## Context

Ghost Hours promises a *defensible* invoice draft while staying strictly
offline: no server, no network call, everything in the browser
(`apps/web/src/state/types.ts:58-59` — "Local, chained audit trail of every
decision (never leaves the browser)"). "I confirmed this block on that day" is
a statement a freelancer may have to stand behind; a plain log file that anyone
— including its owner, later — can edit or prune proves nothing.

## Decision

**Every decision the user makes is appended to a local audit trail in which
each entry hashes the previous one** (`apps/web/src/state/audit.ts:4-12`):

- `fingerprintOf(entry, previous)` — FNV-1a over `previous|at|action|blockId|clientId|detail`
  (`apps/web/src/state/audit.ts:39-41`); the chain starts from a genesis `'0'`
  (`:28`).
- `appendAudit` is the only writer; the reducer calls it for every audited
  action, never for view-only ones (`apps/web/src/state/store.tsx:134-150`).
- `verifyAudit` walks the chain and reports the first broken link
  (`apps/web/src/state/audit.ts:49-60`) — an edited *or removed* line fails it.
- The trail is persisted with the state (`apps/web/src/state/persistence.ts:33-54`;
  optional in the schema so a state saved before the trail existed still loads)
  and exported as CSV, or as JSON carrying the verification verdict
  (`apps/web/src/state/audit.test.ts:32-46`).
- Entries hold ids and minutes, **never free text** — `describeAction` is the
  only detail producer (`apps/web/src/state/audit.test.ts:48-51`).

Alternatives set aside: a server-side log (breaks the offline promise), a plain
JSON array (editable without a trace), user-typed justifications (privacy and
injection surface for zero defensive value).

## Consequences

- Tampering shows: altering a line breaks its fingerprint and every link after
  it; removing a line breaks the successor (`apps/web/src/state/audit.test.ts:17-30`).
- The draft invoice gains a trace: confirmations, adjustments, rejections and
  reconstructions all leave an entry with a local timestamp.
- **Honest limitation** — FNV-1a is a checksum, not a signature: an attacker
  with the file can recompute the whole chain. The chain proves *accidental*
  edits and makes deliberate ones visible-effort, not impossible. It is a
  deterrent and a conversation record, not a cryptographic seal.

## Proof

- **Implementation, file:line** — `apps/web/src/state/audit.ts:4-12` (intent),
  `:28` (genesis), `:39-41` (`fingerprintOf`), `:43-47` (`appendAudit`),
  `:49-60` (`verifyAudit`); wiring: `apps/web/src/state/store.tsx:134-150`,
  `apps/web/src/state/types.ts:58-59`, `apps/web/src/state/persistence.ts:33-54`,
  `:248`, `:278`.
- **Regression tests** — `apps/web/src/state/audit.test.ts`: *"chains each
  entry to the previous fingerprint"* (`:9`), *"detects an altered line"*
  (`:17`), *"detects a removed line"* (`:25`), CSV export (`:32`), JSON with
  verdict (`:41`), ids-not-free-text (`:48`);
  `apps/web/src/state/persistence.test.ts:76-82` *"keeps the audit trail across
  save and load"*.
- **Origin** — commit `71b170f` "moteur : pauses non facturées, automatisation
  écartée mais listée, raison par bloc, **journal d'audit**, partage de
  conflit"; the feature is labelled idea C-06 in the code
  (`apps/web/src/state/audit.ts:5`, `apps/web/src/i18n/en.ts:281`).
