---
name: property-hunt
description: Add a fast-check property tied to a HEU-P-nn identifier, from stating the property to shrinking a counterexample and recording it in the journal. Use when a new invariant appears, when a property is missing from a package, or when a bug needs to be turned into a generated test.
---

# Property hunt

A property test is worth writing when it says something that must be true for *all* inputs, and
when a hand-written example could never cover the space. In this project that is the whole interval
algebra, the reconstruction and the rounding: fourteen properties, `HEU-P-01` … `HEU-P-14`.

## 1. State the property in one sentence

Before any code, write the sentence and check it against these tests:

- **Universal?** It must hold for every input in the domain, not for the three cases you thought of.
- **Falsifiable?** If you cannot imagine an input that breaks it, it is a tautology.
- **Domain-accurate?** Say what the input is: "for any set of ranges", "for any rounding rule and
  any non-negative minutes", "for any evidence set and any settings".
- **Owned once.** It belongs to exactly one package (see the table below). Another package may
  re-assert it, never own it twice.

| Property | Owner | Statement |
|---|---|---|
| HEU-P-01 | `intervals` | no two proposed or confirmed blocks overlap |
| HEU-P-02 | `intervals` | a day's total equals the union and never exceeds the day |
| HEU-P-03 | `sessionizer` | blocks do not depend on import order |
| HEU-P-04 | `sessionizer` | adding evidence never decreases proven duration |
| HEU-P-05 | `sessionizer` | every client-assigned evidence is covered or conflicted |
| HEU-P-06 | `sessionizer` | every non-manual block has at least one evidence |
| HEU-P-07 | `sessionizer` | an assumed start never precedes the previous evidence nor the workday start |
| HEU-P-08 | `billing` | rounding up never shrinks; rounding twice changes nothing |
| HEU-P-09 | `billing` | the total is the sum of the lines |
| HEU-P-10 | `billing` | a threshold day is worth 0, 0.5 or 1 |
| HEU-P-11 | `ics` | a duration is the same in any display zone, DST included |
| HEU-P-12 | `ics` | occurrences are inside the period, unique, exceptions excluded |
| HEU-P-13 | `sessionizer` | a new reconstruction never modifies a locked block |
| HEU-P-14 | `collector` | re-importing the same evidence leaves the state unchanged |

## 2. Write the generator, not the test

Generators live in `packages/<name>/src/arbitraries.ts` so they can be shared and so the test file
stays readable.

```ts
import fc from 'fast-check';

// instants in a plausible window, on a 15-minute grid: readable failures
export const arbInstant = fc.integer({ min: 1_760_000_000_000, max: 1_800_000_000_000 })
  .map((ms) => ms - (ms % (15 * 60_000)));

export const arbRange = fc.tuple(arbInstant, fc.integer({ min: 0, max: 8 * 3_600_000 }))
  .map(([start, length]) => ({ start, end: start + length }));

export const arbRanges = fc.array(arbRange, { maxLength: 40 });
```

Rules for generators:

- **Small and overlapping.** A generator whose values never overlap never finds the overlap bug.
- **Valid domain values.** Whole minutes, `end > start`, ids from a pool of three clients.
- **Include the nasty cases on purpose**: a DST day, midnight, two ranges touching exactly.
- **`maxLength` low** (20–50) so a shrunk failure fits on one screen.

## 3. Write the test, named after the property

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

describe('intervals', () => {
  it('HEU-P-01 normalized ranges never overlap', () => {
    fc.assert(
      fc.property(arbRanges, (ranges) => {
        const normalized = normalize(ranges);
        for (let i = 0; i < normalized.length - 1; i += 1) {
          expect(normalized[i]!.end).toBeLessThanOrEqual(normalized[i + 1]!.start);
        }
      }),
      { seed: 20261101, numRuns: 300 },
    );
  });
});
```

- The name **starts with the id**. `-t "HEU-P-01"` then selects exactly one test.
- **Fixed seed** in the form `2026MMDD`, plus `numRuns`.
- One assertion family per test: if the property has two halves, write two tests with the same id
  and a different suffix.

## 4. Run it, and read the failure

```
pnpm vitest run packages/<name> -- -t "HEU-P-nn"
```

fast-check prints the shrunk counterexample. Then decide, in one sentence, **which side is wrong**:

| Wrong side | Symptom | Action |
|---|---|---|
| implementation | the counterexample is a legitimate input | fix the code, keep the property |
| generator | the counterexample is not a valid domain value | fix the generator, re-run |
| property | the statement was too strong | say so explicitly, correct the statement, note it in the journal |

Never weaken a property to make it pass. A weakened property is worse than no property, because it
claims a guarantee it does not give.

## 5. Keep the scar

Add the shrunk case as an explicit example test next to the property:

```ts
it('HEU-P-08 regression: 61 minutes rounded up to 15 gives 75', () => {
  expect(roundMinutes(61, { mode: 'up', stepMinutes: 15, scope: 'total' })).toBe(75);
});
```

The property catches the next variant; the example documents the one that happened.

## 6. Record it

Append to `KIRO_JOURNAL.md`, under "property counterexamples":

```
- HEU-P-08, seed 20261108 — 61 min rounded up to 15 gave 60: `Math.round` instead of `Math.ceil`.
  Fixed in packages/billing/src/rounding.ts. Regression test kept.
```

That line is the answer to the form question "did property tests find defects?", so it must be real:
no counterexample, no entry.

## 7. Definition of done

- [ ] test named `HEU-P-nn …`, fixed seed, `numRuns` set;
- [ ] generator in `arbitraries.ts`, not inline;
- [ ] `pnpm vitest run packages/<name>` green;
- [ ] regression example added if a counterexample was found;
- [ ] journal entry written (or `TODO(measure)` if the run has not happened yet);
- [ ] no file over 500 lines, no function over 50.
