# Design — `intervals`

## 1. Model

```ts
type Instant = number;   // epoch ms, from @ghost-hours/core
interface Range { start: Instant; end: Instant }   // half-open: [start, end)
```

Half-open is the whole design. It makes three things true at once:

- a block ending at 12:00 and one starting at 12:00 do not overlap (no double billing, O3);
- the duration is exactly `end - start`, no `+1` anywhere;
- concatenating consecutive ranges is lossless.

An empty range (`end <= start`) is **not a value of the domain**: every constructor drops it, so no
function has to reason about it. That is the invariant that keeps the rest simple.

## 2. Components

| Module | Responsibility |
|---|---|
| `range.ts` | `range()`, `duration()`, `isEmpty()`, `overlaps()`, `contains()`, `clipTo()` |
| `normalize.ts` | sort, merge touching/overlapping, drop empty |
| `union.ts` | union of two sets (normalize of the concatenation) |
| `intersection.ts` | pairwise intersection of two normalised sets |
| `difference.ts` | subtract a set from a set |
| `split.ts` | `splitAt(range, points)`, `gaps(day, ranges)` |
| `coverage.ts` | `coveredMs(range, covering)`, `provenShare(range, covering)` |
| `index.ts` | barrel |

Seven small modules rather than one `intervals.ts`: each stays far under 500 lines and each has a
property of its own. `normalize` is the only algorithm with a non-trivial loop.

## 3. Signatures

```ts
// range.ts
export function range(start: Instant, end: Instant): Range | null;
export function duration(r: Range): number;              // ms, >= 0
export function isEmpty(r: Range): boolean;
export function overlaps(a: Range, b: Range): boolean;   // a.start < b.end && b.start < a.end
export function touches(a: Range, b: Range): boolean;    // a.end === b.start || b.end === a.start
export function contains(outer: Range, inner: Range): boolean;
export function clipTo(r: Range, bounds: Range): Range | null;

// normalize.ts
export function normalize(ranges: readonly Range[]): Range[];

// union.ts / intersection.ts / difference.ts
export function union(a: readonly Range[], b: readonly Range[]): Range[];
export function intersection(a: readonly Range[], b: readonly Range[]): Range[];
export function difference(a: readonly Range[], b: readonly Range[]): Range[];

// split.ts
export function splitAt(r: Range, points: readonly Instant[]): Range[];
export function gaps(day: Range, ranges: readonly Range[]): Range[];

// coverage.ts
export function coveredMs(r: Range, covering: readonly Range[]): number;
export function provenShare(r: Range, covering: readonly Range[]): number;  // 0..1
```

Minutes conversion is **not** here: callers use `msToWholeMinutes` from core, so rounding policy
stays in one place.

## 4. Algorithms

**normalize** — sort by `start` (then by `end`, so the order is total and stable), then a single
pass: keep a `current`; if `next.start <= current.end` extend `current.end` to
`Math.max(current.end, next.end)`, else push `current` and start a new one. O(n log n) from the
sort, O(n) after. Sorting with an explicit comparator is what makes HEU-P-03 (order independence)
true for free in every caller.

**difference** — normalise `b`, then for each `a` walk `b` with a cursor and emit the pieces of `a`
between the `b` ranges. Never materialises a merged array of `b` per `a` (that would be O(n·m) with
allocation); the cursor makes it O(n + m) after normalisation.

**coveredMs** — `duration(intersection([r], covering))`, i.e. the sum over the intersections. Written
once, used by `provenShare` and by the confidence level in `sessionizer`.

**gaps** — `difference([day], ranges)`, restricted to `day`. No separate implementation.

## 5. Invariants (asserted in tests, not in code)

1. `normalize` output is sorted, disjoint and non-touching.
2. `duration(union(a, b)) <= duration(a) + duration(b)`, with equality iff `a` and `b` are disjoint.
3. `duration(difference(a, b)) + duration(intersection(a, b)) === duration(union(a, b))`.
4. `coveredMs(r, covering) <= duration(r)`.
5. `intersection(a, b)` and `difference(a, b)` are subsets of `normalize(a)`.
6. Idempotence: `normalize(normalize(x)) === normalize(x)`.

Invariant 3 is the algebraic identity that makes double billing structurally impossible; it is worth
one test of its own.

## 6. Errors

None. Every function is total: empty input → empty output, inverted range → `null` from `range()`,
points outside a range → ignored by `splitAt`. Throwing would force `try` blocks in the
reconstruction, where a dropped range is already the right behaviour (it becomes an orphan or a
conflict upstream, never a silent sum).

The one place a caller must be careful: `range()` returning `null`. Callers narrow with
`if (r !== null)`; there is no `!` in this package.

## 7. Properties to test

| Property | Test | Shape |
|---|---|---|
| **HEU-P-01** | `normalize.test.ts` | `fc.assert` over an arbitrary array of ranges: output is sorted, pairwise non-overlapping, and `duration(normalize(x)) === duration(union(x))` |
| **HEU-P-02** | `coverage.test.ts` | for ranges clipped to a day, `sum(duration) === duration(union)` and `<= duration(day)` |
| identity 3 | `difference.test.ts` | `dur(diff) + dur(inter) === dur(union)` |
| idempotence | `normalize.test.ts` | `normalize(normalize(x))` deep-equals `normalize(x)` |
| no zero-length piece | `split.test.ts` | `splitAt` and `gaps` never return `end === start` |

Generators live in `arbitraries.ts`:

```ts
export const arbInstant = fc.integer({ min: 1_760_000_000_000, max: 1_800_000_000_000 });
export const arbRange = fc.tuple(arbInstant, fc.integer({ min: 0, max: 12 * 3_600_000 }))
  .map(([start, len]) => ({ start, end: start + len }));
export const arbRanges = fc.array(arbRange, { maxLength: 40 });
```

Small numbers on purpose: overlaps must happen often, and a failing case must be readable.

## 8. Why this package is the "spec vs vibe coding" case

The cahier (D.13) names `intervals` as the candidate for the comparison, and it is a fair choice:
the naive implementation ("sort, merge, done") is twenty lines and looks obviously right, and it is
wrong in three ways that only a property test finds — touching ranges, an inverted range surviving,
and a `difference` that merges `b` per `a`. The measurement of both paths (duration, round trips,
defects found) is recorded in `KIRO_JOURNAL.md`; until it is actually run there, the numbers are
`TODO(measure)`.

## 9. Boundaries with other packages

| Consumer | Uses | Does not use |
|---|---|---|
| `sessionizer` | `normalize`, `difference`, `coveredMs`, `gaps` | any zone logic |
| `billing` | `duration`, `normalize`, `intersection` | reconstruction rules |
| `apps/web` | `overlaps` (to assert HEU-P-01 on the rendered grid) | anything that mutates a block |
