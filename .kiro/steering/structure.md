---
inclusion: always
---

# Ghost Hours — structure steering

## Tree

```
ghost-hours/
├── packages/
│   ├── core/          domain types, zod schemas, time/id/format helpers (frozen API)
│   ├── intervals/     pure interval algebra (union, intersection, difference, split)
│   ├── ics/           RFC 5545 subset reader, recurrence expansion, time zones
│   ├── notes/         Markdown notes reader (dated files, timestamped lines, client tags)
│   ├── mapping/       evidence → client association rules
│   ├── sessionizer/   the D.5 reconstruction algorithm
│   ├── billing/       rounding, billing modes, caps, invoice draft, annex, exports
│   └── collector/     read-only Git CLI writing evidence.json
├── apps/web/          Vite + React static app (month, week, evidence, clients, invoice, settings)
├── fixtures/sample-month/   fictitious month used by the demo and the acceptance tests
├── scripts/           Node guards run by hooks and CI (check-privacy, check-no-network, …)
├── .kiro/             steering, specs, hooks, agents, skills  (contest requirement)
├── docs/              English docs (architecture, acceptance)
├── KIRO_JOURNAL.md    Kiro usage log (contest requirement)
└── LICENSE            MIT (contest requirement)
```

## Package layout

Every package is the same shape:

```
packages/<name>/
├── package.json        name "@ghost-hours/<name>", main/types/exports → ./src/index.ts
├── tsconfig.json       extends ../../tsconfig.base.json
└── src/
    ├── index.ts        the only public surface (barrel)
    ├── <module>.ts
    └── <module>.test.ts
```

`apps/web`:

```
apps/web/src/
├── main.tsx          entry, mounts <App/>
├── app/              screens: month, week, evidence, clients, invoice, settings
├── components/       presentational components, one concern each
├── state/            reducers/selectors, persistence to localStorage
├── i18n/             en.ts (default), fr.ts
└── styles/           tokens + layout
```

## The barrel rule

- `src/index.ts` is the **only** entry point other packages may import from.
- The barrel re-exports with `export * from './module.ts';` — one line per module, alphabetical.
- Never import another package's internal file (`@ghost-hours/core/src/time.ts` is forbidden);
  if a helper is missing from the barrel, the fix belongs in `core`'s barrel.
- Inside a package, import sibling modules by relative path with the explicit `.ts` extension.

## Imports

```ts
import type { Block, Instant } from '@ghost-hours/core';   // types: `import type`
import { ok, err, dayRangeInZone } from '@ghost-hours/core'; // values
import { union } from './union.ts';                          // relative, with `.ts`
```

- `import type` for type-only imports (`consistent-type-imports` is an ESLint error).
- Explicit `.ts` on every relative import (`allowImportingTsExtensions` is on).
- Bare specifiers only for workspace packages and Node built-ins (`node:fs`, `node:path`).

## Naming

| Thing | Convention | Example |
|---|---|---|
| file | kebab-case, one concern | `day-thresholds.ts` |
| type / interface | PascalCase, no `I` prefix | `InvoiceLine`, `ReconstructionSettings` |
| function | camelCase, verb first | `expandRecurrence`, `roundMinutes` |
| constant | SCREAMING_SNAKE | `DEFAULT_SETTINGS`, `MINUTE_MS` |
| test file | next to the source, `.test.ts` | `rounding.test.ts` |
| test name | behaviour, or the property id | `'HEU-P-08 rounding up never shrinks a duration'` |
| property id | `HEU-P-nn`, from the cahier | `HEU-P-01` |

## Tests live next to sources

`src/<module>.test.ts` beside `src/<module>.ts`. No `__tests__/` folder, no `test/` tree. The
Vitest config only picks `packages/*/src/**/*.test.ts` and `apps/*/src/**/*.test.{ts,tsx}`, so a
test placed elsewhere silently never runs — that is a defect, not a style choice.

## Sizes

Under 500 lines per file, under 50 lines per function, enforced by ESLint. When a module grows,
split it by responsibility (`rounding.ts`, `modes.ts`, `caps.ts`, `draft.ts`, `annex.ts`) and keep
the barrel as the only surface.

## Where new code goes

| Need | Home |
|---|---|
| a new domain type or zod schema | `packages/core/src/types.ts` / `schema.ts` |
| a time/zone question | `packages/core/src/time.ts` (never a local helper) |
| money or duration formatting | `packages/core/src/format.ts` |
| interval maths | `packages/intervals` |
| reconstruction rule | `packages/sessionizer` |
| rounding or billing mode | `packages/billing` |
| a guard or a CI check | `scripts/*.mjs` |
