---
inclusion: always
---

# Ghost Hours — testing steering

## Tooling

- **Vitest 2** for unit and property tests, `environment: node` by default.
- **fast-check 3.23** for properties. Seeds are fixed and written down.
- **jsdom + @testing-library/react** for the web app only. A DOM test file starts with
  `// @vitest-environment jsdom` as its very first line.
- Commands: `pnpm test` (whole workspace), `pnpm vitest run packages/<name>`, single file:
  `pnpm vitest run packages/billing/src/rounding.test.ts`.

## Placement

Tests live **next to their source**: `packages/intervals/src/union.ts` →
`packages/intervals/src/union.test.ts`. The Vitest config only includes
`packages/*/src/**/*.test.ts` and `apps/*/src/**/*.test.{ts,tsx}`; anything elsewhere never runs.

## Every property has a test named after its id

The cahier lists fourteen properties, `HEU-P-01` … `HEU-P-14`. Each one owned by a package must
exist as a `fast-check` test whose name **starts with the id**, so a failing run is traceable to
the requirement it breaks:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('intervals', () => {
  it('HEU-P-01 no two proposed or confirmed blocks overlap', () => {
    fc.assert(
      fc.property(arbBlocks(), arbBlocks(), (a, b) => {
        expect(overlaps(a, b)).toBe(false);
      }),
      { seed: 20261101, numRuns: 200 },
    );
  });
});
```

Ownership (from D.13): `intervals` → P-01, P-02 · `sessionizer` → P-03 … P-07, P-13 ·
`billing` → P-08, P-09, P-10 · `ics` → P-11, P-12 · `collector` → P-14.
A property may be **re-asserted** by another package (the UI asserts P-01 again on the rendered
grid), but it has exactly one owning test.

## Fixed seeds, reproducible failures

- Always pass `{ seed: <number>, numRuns: <n> }` to `fc.assert`. A property that only fails on a
  random seed is not a test, it is a lottery.
- Record the seed in the test file and, when a counterexample is found, in `KIRO_JOURNAL.md`.
- Use the seed convention `2026MMDD` (e.g. `20261101`) so a date can be traced.
- When fast-check shrinks a counterexample, keep it as an explicit `it('HEU-P-nn … regression')`
  example test beside the property. The property stays; the example documents the scar.

## Arbitraries

- Build generators in `packages/<name>/src/arbitraries.ts` (not `.test.ts`, so they can be reused
  by the UI tests) and export them from the barrel only when another package needs them.
- Generators must produce **valid domain values**: instants inside a plausible window, durations
  in whole minutes, `clientId` from a small pool so overlaps actually happen.
- Include the nasty cases deliberately: DST days (`Europe/Paris` last Sunday of March and
  October), midnight boundaries, an event ending exactly at another's start (half-open intervals:
  `[start, end)` — touching is not overlapping).

## No network in tests

No HTTP, no fixture downloaded, no `localhost` server started by a test. The app is offline by
construction (HEU-N-01); a test that needs the network is testing the wrong thing.
`scripts/check-no-network.mjs` covers tests too.

## Fictitious data only

Fixtures use the allowed names and domains (`example.com`, `example.org`, `example.net`,
`example.edu`, `localhost`, `*.invalid`), clients `Acme`, `Northwind`, `Globex`, people
`Sofia Marquez`, `Malik Osei`, `Yuki Tanaka`, repos `acme-api`, `northwind-portal`, `globex-etl`.
`scripts/check-privacy.mjs` fails the build otherwise. Never paste a real commit, a real email
address or a real client name into a test, even as a comment.

## Shape of a good test

- One behaviour per `it`; the name says what breaks, not what the function is called.
- Arrange / act / assert, no shared mutable state between tests.
- Assert values, not snapshots, except for the two places where a rendered structure is the
  contract (the week grid and the equivalent table).
- Test the **domain** exhaustively, the UI on behaviour a keyboard user can perform.

## Definition of done

`pnpm test` green for the touched packages, the property owned by the package present and named
after its id, seed recorded, no network, no real data, no skipped test left behind
(`it.skip` needs a comment saying why and a task to remove it).
