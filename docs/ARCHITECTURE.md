# Architecture

```
Git repositories ──▶ collector (CLI, read-only) ──▶ evidence.json ─┐
.ics agenda ───────────────────────────────────────────────────────┼──▶ web app (static)
notes folder ──────────────────────────────────────────────────────┘        │
                                                                            ▼
  evidence ──▶ mapping ──▶ sessionizer ──▶ blocks ──▶ human review ──▶ billing ──▶ draft
              (rules)     (intervals)                (confirm/adjust)             CSV · PDF · JSON
```

## Layers

1. **Capture** — `packages/collector` reads Git; `packages/ics` reads the agenda;
   `packages/notes` reads Markdown. All three produce the same `Evidence` shape (spec D.10) with
   deterministic ids, so importing the same file twice changes nothing.
2. **Association** — `packages/mapping` attaches each piece of evidence to a client through
   explicit rules (repository, remote fragment, attendee domain, title fragment, note tag). What
   no rule covers stays an *orphan* and is shown to the user, never guessed.
3. **Reconstruction** — `packages/sessionizer` implements spec D.5: sessions per client split on
   `gapMax`, session starts derived from reflog checkouts or an assumed lead-in, meetings as exact
   blocks, overlaps trimmed or turned into conflicts, same-client blocks merged, confidence from
   the proven share. Locked and user-adjusted blocks survive every new pass.
4. **Review** — `apps/web` shows the month counter, the week grid and the evidence of a block. A
   block is proposed, confirmed, rejected or in conflict; the three states differ by shape, not
   only by colour.
5. **Billing** — `packages/billing` turns confirmed blocks into a draft: hourly or daily modes,
   rounding per session/day/total, one day per client per day at most, subtotal = sum of lines,
   tax, and an optional evidence annex. The draft is always labelled **Draft** and never carries an
   invoice number.

## Non-negotiable invariants

| Invariant | Where it is enforced |
|---|---|
| Two blocks never overlap (HEU-P-01) | `sessionizer` + property test |
| Same input, same blocks, whatever the import order (HEU-P-03) | explicit sorting everywhere |
| A minute is never billed to two clients (O3) | overlap resolution, conflict instead of a guess |
| Only confirmed blocks are billable (HEU-F-23) | `billing.billableMinutes` |
| Durations are time-zone independent (HEU-P-11) | instants only, `zonedTimeToInstant` |
| No network after load (HEU-N-01) | `scripts/check-no-network.mjs` in CI |
| No real client data in the repo (HEU-N-06) | `.kiroignore`, `.gitignore`, `scripts/check-privacy.mjs` |
| Files < 500 lines, functions < 50 lines | ESLint `max-lines`, `max-lines-per-function` |
| CI verdict in ≤ 5 minutes | `timeout-minutes: 5` on every job + `ci-budget` check |

## Why a monorepo

The domain is a pipeline of small, testable steps, and each step owns a different kind of mistake:
time zones (`ics`), ordering (`sessionizer`), rounding (`billing`), read-only access (`collector`).
Splitting them keeps every file under the 500-line budget and lets a property test target exactly
one responsibility.
