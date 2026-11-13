# Acceptance

The checklist of the specification (D.17), with the evidence for each line. Everything below is
reproducible with `pnpm install && pnpm test` and `pnpm lint`.

| # | Requirement | Evidence |
|---|---|---|
| 1 | On the sample month the counter shows the expected values | `fixtures/sample-month/sample-month.test.ts` — *reconstructs exactly the announced hours*, *shows the ghost hours and their amount*: 6 240 found, 5 520 declared, 720 ghost, 78 000 cents. `apps/web/src/screens/Month.test.tsx` — *announces 104 h found, 12 h of ghost hours and 780 €* |
| 2 | No overlap in the produced blocks | `packages/sessionizer/src/properties.test.ts` — *HEU-P-01*, plus the last line of defence `removeOverlaps()` in `packages/sessionizer/src/blocks.ts` |
| 3 | The test browser makes no request after load | Two proofs: static (`node scripts/check-no-network.mjs`, also a CI step — no `fetch`, `XMLHttpRequest`, `WebSocket` or remote `<script>` in `packages/` or `apps/`) and dynamic (`e2e/smoke.spec.ts`, requirement 2 — a real browser visits all six screens and fails on any request to a foreign origin or any console error) |
| 4 | The collector modifies no repository | `packages/collector/src/readonly.test.ts` — *leaves every file of the repository byte-identical*, *keeps HEAD, the branch and the status fingerprint identical*, *does not touch the repository when the output file lives inside it* |
| 5 | A month containing a DST change gives the right durations | `packages/ics/src/properties.test.ts` — *HEU-P-11*, and `packages/core/src/time.test.ts` — *keeps the local clock across a DST change* |
| 6 | The draft total is the sum of its lines, in all three modes | `packages/billing/src/properties.test.ts` — *HEU-P-09*, *HEU-P-08*, *HEU-P-10* |
| 7 | The public repository holds no real name or domain | `node scripts/check-privacy.mjs` (CI step): only `example.com`, `example.org`, `example.net`, `example.edu` and `localhost` are accepted. `.kiroignore` and `.gitignore` keep real `evidence.json` files out of the tree |
| 8 | The fourteen properties pass | `HEU-P-01`…`HEU-P-07`, `HEU-P-13`, `HEU-P-14` in `packages/sessionizer`, `HEU-P-08`…`HEU-P-10` in `packages/billing`, `HEU-P-11` and `HEU-P-12` in `packages/ics`. Each test is named after its identifier |

## End-to-end coverage

`e2e/smoke.spec.ts` drives the built application in a real browser (spec
`.kiro/specs/e2e-smoke`): the sample month in one click with the figures read from
`fixtures/sample-month/expected.json`, no request to a foreign origin, the reviewer path (week grid
→ confirm a day → confirmed hours rise → invoice says **Draft** with no number → CSV download), and
the contradiction of 16 November with its three gestures. It runs after each deploy and on demand,
never on a pull request, so the five-minute verdict is untouched.

## Property coverage

| Id | Where |
|---|---|
| HEU-P-01 | `sessionizer` — no two blocks a user could confirm overlap |
| HEU-P-02 | `sessionizer` — a day holds no more than a day, and the total equals the union |
| HEU-P-03 | `sessionizer`, `intervals`, `mapping`, `notes` — the order of the input does not matter |
| HEU-P-04 | `sessionizer` — adding a proof never lowers the proven time (single client; with several clients, while no new contradiction appears) |
| HEU-P-05 | `sessionizer` — every mapped proof sits in a block, a conflict or the leftovers |
| HEU-P-06 | `sessionizer` — no block without proof |
| HEU-P-07 | `sessionizer` — an assumed lead-in stays bounded by the previous proof and by `workdayStart` |
| HEU-P-08 | `billing` — rounding up never shortens, and rounding twice changes nothing |
| HEU-P-09 | `billing` — the draft total is the sum of its lines and recalculates from the blocks |
| HEU-P-10 | `billing` — a day by thresholds is 0, 0.5 or 1 |
| HEU-P-11 | `ics`, `core` — durations and day lengths survive a DST change |
| HEU-P-12 | `ics` — recurrence expansion: inside the window, no duplicate, exceptions excluded |
| HEU-P-13 | `sessionizer` — a locked block comes back byte for byte |
| HEU-P-14 | `sessionizer`, `mapping`, `collector` — re-importing the same evidence changes nothing |

## Limits, said out loud

- The `.ics` reader covers the common subset of RFC 5545. `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`,
  sub-daily frequencies, `VALARM` and period values are not expanded: they produce an explicit
  warning and the event falls back to a simple recurrence. Nothing is dropped silently.
- A `TZID` that is not a valid IANA zone falls back to the `VTIMEZONE` offsets declared in the file;
  a recurring event in such a zone keeps the offset of its `DTSTART`.
- The invoice is a **draft**: no numbering, no legal archiving, no transmission. The hybrid
  Factur-X format (HEU-F-28) is out of the minimal scope.
- Calibration (HEU-F-17) proposes a new default lead-in after ten corrections; it never applies it
  by itself.
