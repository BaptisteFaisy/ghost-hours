# Design — `sessionizer`

## 1. The nine steps of D.5, as a pipeline

```
Evidence[] ──▶ 1 normalise ──▶ 2 associate (given: already has clientId) ──▶ 3 sessions
             ──▶ 4 starts ──▶ 5 ends ──▶ 6 meetings ──▶ 7 overlaps/conflicts
             ──▶ 8 merge ──▶ 9 confidence ──▶ ReconstructionResult
```

Each step is a pure function `(state, settings) => state`, so a step can be tested alone and the
whole pipeline is a fold. The state carries the evidence, the accumulated blocks and conflicts.

## 2. Components

| Module | Step | Responsibility |
|---|---|---|
| `normalize.ts` | 1 | sort evidence by `(instant, id)`, split points vs spans, drop invalid |
| `sessions.ts` | 3 | cut per client on `gapMaxMinutes`, drop below `minSessionMinutes` |
| `start.ts` | 4 | resolve the session start (checkout, else lead-in, clamped) |
| `ends.ts` | 5 | last evidence + `tailMinutes` |
| `meetings.ts` | 6 | one exact block per retained meeting, merge same-client overlaps |
| `overlaps.ts` | 7 | trim/split across clients, create conflicts on contradiction |
| `merge.ts` | 8 | join meeting + Git session of the same client when touching |
| `confidence.ts` | 9 | `provenShare`, `confidence`, `assumedLeadInMinutes` |
| `locked.ts` | — | preserve locked blocks, treat them as occupied |
| `calibration.ts` | — | median proposal (HEU-F-17) |
| `reconstruct.ts` | — | the fold, public entry point |
| `index.ts` | — | barrel |

## 3. Signatures

```ts
interface ReconstructInput {
  evidence: readonly Evidence[];          // clientId already resolved by `mapping`
  settings: ReconstructionSettings;
  previousBlocks?: readonly Block[];      // locked blocks from earlier runs
  manualBlocks?: readonly Block[];        // origin: 'manual', kept as-is
}

export function reconstruct(input: ReconstructInput): ReconstructionResult;

// internals, exported for tests
export function buildSessions(evidence: readonly Evidence[], settings: ReconstructionSettings): Session[];
export function resolveStart(session: Session, ctx: StartContext): { start: Instant; assumed: Minutes };
export function resolveOverlaps(blocks: readonly Block[], settings: ReconstructionSettings):
  { blocks: Block[]; conflicts: Conflict[] };
export function assessConfidence(block: Block, evidence: readonly Evidence[], settings: ReconstructionSettings): Block;
export function proposeCalibration(observedLeadIns: readonly Minutes[], current: Minutes):
  CalibrationProposal;
```

`ReconstructionResult`, `Block`, `Conflict`, `Evidence`, `ReconstructionSettings` all come from
`@ghost-hours/core`; the package declares no duplicate type.

```ts
interface Session {
  clientId: string;
  evidence: readonly Evidence[];   // sorted, all kind 'commit' | 'checkout'
  first: Instant;
  last: Instant;
  repo: string | null;
}

interface StartContext {
  previousEvidenceAt: Instant | null;   // any client, before this session
  checkouts: readonly Evidence[];       // same repo, kind 'checkout'
  settings: ReconstructionSettings;
}

interface CalibrationProposal {
  observed: readonly Minutes[];
  median: Minutes;
  current: Minutes;
  ready: boolean;                       // observed.length >= 10
}
```

## 4. Step details

### 4.1 Normalise

Sort by `(at ?? start, id)` — `id` as the tie-break is what makes the order total, and that is what
HEU-F-16 and HEU-P-03 rest on. Drop evidence with neither `at` nor `start`/`end`, and evidence whose
client is `null` (they go to `orphanEvidence`, not to sessions).

### 4.2 Sessions

Per client, walk the sorted Git evidence; a new session starts when
`next.at - currentLast > minutesToMs(settings.gapMaxMinutes)`. Note **strictly greater**: a gap
exactly equal to `gapMax` stays in the session (Requirement 1.2). Sessions whose span
`last - first < minSessionMinutes` are dissolved and their evidence returned as orphans.

### 4.3 Start

```ts
function resolveStart(session, ctx) {
  const checkout = lastCheckoutBefore(session.first, ctx.checkouts, ctx.settings.leadInMaxMinutes);
  const lowerBound = maxInstant(
    ctx.previousEvidenceAt,
    workdayStartInstant(session.first, ctx.settings),   // zonedTimeToInstant with workdayStart
  );
  if (checkout && checkout.at > lowerBound) return { start: checkout.at, assumed: 0 };
  const candidate = session.first - minutesToMs(ctx.settings.leadInDefaultMinutes);
  const start = clampInstant(candidate, lowerBound, session.first);
  return { start, assumed: msToWholeMinutes(session.first - start) };
}
```

Three details that are easy to get wrong and are therefore in the requirements:

- the checkout must be **later than the previous evidence of any client**, otherwise two clients
  would share minutes;
- `workdayStart` is resolved **on the session's own day**, in `settings.timeZone`, via
  `zonedTimeToInstant` — never by adding hours to a day start;
- when the clamp is a no-op (`start === session.first`), `assumed` is 0, not `leadInDefault`.

### 4.4 Ends

`end = last evidence + minutesToMs(settings.tailMinutes)`, then `end = max(end, start + minSession)`.
Default `tail` is 0: the last commit is the end, no invented time.

### 4.5 Meetings

One block per retained meeting, `provenShare: 1`, `assumedLeadInMinutes: 0`, `origin: 'meeting'`.
Same-client overlaps merge into one block with `origin: 'merged'` and the union of evidence ids.

### 4.6 Overlaps and conflicts (the delicate one)

```ts
for each gitBlock (in start order):
  for each meeting of a different client that overlaps it:
    if the meeting covers the gitBlock's *evidence* instants  → conflict
    else                                                      → trim/split the gitBlock
```

The asymmetry is the prudence principle: a meeting has known bounds, a lead-in is assumed, so the
assumption yields. But when the commits themselves fall inside another client's meeting, the two
sources genuinely contradict each other and no automatic rule is honest — a `Conflict` is created
with both sides intact. The conflict's `reason` is a fixed English string; the ids come from
`conflictId(start, end, blockIds)`.

Locked blocks are inserted as occupied ranges **before** this loop and are never trimmed.

### 4.7 Merge

A meeting and a Git session of the same client that touch or overlap become one block: span is the
union, `origin: 'merged'`, `provenShare` recomputed, evidence ids concatenated and sorted.

### 4.8 Confidence

`provenShare = coveredMs(block, evidenceIntervals) / duration(block)`, where `evidenceIntervals` are
the intervals between consecutive evidence of the block (a commit is a point, so the proven part of a
Git session is the span between its first and last commit) plus the meeting spans. Thresholds 0.8 /
0.5 map to `solid` / `likely` / `to-confirm`.

## 5. Data flow and determinism

- Input evidence is sorted once at entry; every later loop iterates a sorted array.
- No `Map` iteration whose order affects output; when a map is unavoidable, `[...map.values()].sort(byId)`.
- Block ids: `blockId(start, end, clientId, origin)`; two blocks can never share an id because they
  can never share `(start, end, clientId, origin)` after overlap resolution — and if they did, that
  would be a HEU-P-01 failure worth seeing.
- The output arrays are frozen (`Object.freeze` in dev, `readonly` in types).

## 6. Errors

| Situation | Behaviour |
|---|---|
| evidence with `clientId: null` | not an error: goes to `orphanEvidence` (HEU-F-09) |
| evidence with no instant | skipped, counted in `settings` report |
| a session longer than `dayLengthMinutes * 2` | kept, but `warnings` notes it (likely a stale reflog) |
| conflicting settings (`leadInDefault > leadInMax`) | `resolveSettings` from core clamps; no throw |
| locked block overlapping new evidence | evidence attached to the locked block, no error |

`reconstruct` never throws on data: it returns a result. Throwing is reserved for programmer errors
(an invalid `settings` object that core's `resolveSettings` rejects).

## 7. Properties to test

| Property | Test | Shape |
|---|---|---|
| **HEU-P-03** order independence | `reconstruct.test.ts` | shuffle generated evidence with `fc.shuffledSubarray`, assert deep equality of blocks |
| **HEU-P-04** monotonic proof | `reconstruct.test.ts` | add one evidence, assert `sum(provenShare * duration)` does not decrease |
| **HEU-P-05** nothing disappears | `reconstruct.test.ts` | every evidence id is in a block, a conflict, or `orphanEvidence` |
| **HEU-P-06** non-manual blocks have evidence | `reconstruct.test.ts` | filter `origin !== 'manual'`, assert `evidenceIds.length > 0` |
| **HEU-P-07** assumed start bounds | `start.test.ts` | generated session + context, assert `start >= previous` and `start >= workdayStart` |
| **HEU-P-13** locked preserved | `locked.test.ts` | generate locked blocks, reconstruct, assert byte equality |
| **HEU-P-01** re-asserted | `reconstruct.test.ts` | no pair of returned blocks overlaps |

Generator: `arbEvidence()` producing 1–200 items across 2–3 clients with a realistic instant
distribution (working hours, some evening commits, a few DST days), and `arbSettings()` with
`gapMax` 30–180, `leadInDefault` 0–60, `leadInMax` ≥ `leadInDefault`, `minSession` 5–30.

## 8. Why the output is a proposal

Every block leaves this package as `status: 'proposed'` (or `'conflict'`). Nothing here confirms a
block, and nothing here bills one. That is what makes `billing`'s rule — *only confirmed blocks are
billable* — enforceable in one place (see `steering/prudence.md`).
