# Design — `billing`

## 1. Position

```
Block[] (confirmed / locked) ──▶ group by client+project ──▶ mode ──▶ rounding ──▶ caps
                             ──▶ InvoiceDraft (+ annex) ──▶ exports (CSV · print · JSON)
```

The package receives blocks and settings; it never reads evidence, never reconstructs, never touches
the DOM. `window.print()` is called by the web app, not here — this package only builds the printable
model.

## 2. Components

| Module | Responsibility |
|---|---|
| `rounding.ts` | `roundMinutes(minutes, rule)`, `roundByScope(entries, rule)` |
| `modes.ts` | `hourlyLines`, `thresholdLines`, `proportionalLines` — one per mode |
| `caps.ts` | one-day-per-client cap, all-clients day warning |
| `draft.ts` | `draftInvoice(input)` → `InvoiceDraft` |
| `annex.ts` | `buildAnnex(blocks, evidence, detail)` → `AnnexDay[]` |
| `exports.ts` | `timesheetCsv`, `datasetJson` (serialisation via core) |
| `lock.ts` | `markPeriodBilled(blocks, period)` |
| `index.ts` | barrel |

## 3. Signatures

```ts
interface DraftInput {
  client: Client;
  period: Period;
  blocks: readonly Block[];            // any status; the package filters
  settings: ReconstructionSettings;
  taxRateBp: BasisPoints;              // typed by the user, default 0
  notes?: readonly string[];
  issuerName: string;
}

export function draftInvoice(input: DraftInput): InvoiceDraft;
export function buildAnnex(
  blocks: readonly Block[], evidence: readonly Evidence[], detail: AnnexDetail,
  timeZone: string,
): AnnexDay[];
export function timesheetCsv(rows: readonly TimesheetRow[], locale: SupportedLocale): string;
export function markPeriodBilled(blocks: readonly Block[], period: Period, clientId: string): Block[];

// internals
export function roundMinutes(minutes: Minutes, rule: RoundingRule): Minutes;
export function roundByScope(entries: readonly { key: string; minutes: Minutes }[], rule: RoundingRule): Minutes;
export function thresholdQuantity(minutes: Minutes, settings: ReconstructionSettings): 0 | 0.5 | 1;
export function proportionalQuantity(minutes: Minutes, settings: ReconstructionSettings): number;
export function hourlyAmountCents(minutes: Minutes, rateCents: Cents): Cents;
export function dayAmountCents(quantity: number, dayRateCents: Cents): Cents;
```

All the types are core's (`InvoiceDraft`, `InvoiceLine`, `AnnexDay`, `RoundingRule`, `Client`,
`Block`, `Period`, `BasisPoints`, `Cents`, `Minutes`). Nothing is redeclared.

## 4. Money arithmetic rules

- Everything is integer cents. A rate per minute is `rateCents / 60`, which is **not** an integer, so
  the multiplication is done as `Math.round(minutes * rateCents / 60)` once per line — never per
  block, never accumulated as a float.
- A day rate is `dayRateCents * quantity` where `quantity ∈ {0, 0.5, 1}` or a ratio in `[0, 1]`;
  the result is `Math.round(dayRateCents * quantity)`.
- Tax is `Math.round(subtotalCents * taxRateBp / 10_000)`.
- Rounding money half-up is the only place a `.5` appears; it is documented in `roundingNote`.
- No `toFixed`, no `parseFloat`, no string concatenation to build an amount.

## 5. Rounding, precisely

```ts
roundMinutes(m, { mode, stepMinutes }) =
  m === 0 ? 0
  : mode === 'none'     ? m
  : mode === 'up'       ? Math.ceil(m / step) * step
  : /* nearest */         Math.floor(m / step + 0.5) * step
```

- `m === 0 → 0` is what stops an empty day becoming 15 minutes (Requirement 3.6).
- `nearest` with `Math.floor(x + 0.5)` puts ties up, deterministically.
- Scope handling: `session` rounds each block's minutes then sums; `day` sums per `dayKey` then
  rounds; `total` sums everything then rounds once. The three are tested with the same input to show
  they differ, which is the point of the setting.

Idempotence (HEU-P-08): `round(round(x)) === round(x)` holds for all three modes because a rounded
value is already a multiple of `step`.

## 6. Modes

| Mode | Quantity | Amount |
|---|---|---|
| `hourly` | `sum(round(block minutes))` | `round(quantity * rateCents / 60)` |
| `daily-thresholds` | `sum(thresholdQuantity(day))` days | `round(days * dayRateCents)` |
| `daily-proportional` | `sum(min(dayMinutes / dayLength, 1))` days | `round(days * dayRateCents)` |

Days are computed with `dayKeyInZone(block.start, settings.timeZone)` — the client's billing day is
the user's working day, not the UTC day. A block crossing midnight is **split at the day boundary**
before grouping, using `dayRangeInZone`, so a 23:30–00:30 session gives 30 minutes to each day and no
day exceeds its cap.

## 7. Draft assembly

```
1. filter blocks: status ∈ {confirmed, locked} ∧ clientId matches ∧ intersects period
2. split at day boundaries, group by (dayKey) for day modes, by projectId for lines
3. apply rounding at the requested scope
4. apply the cap per day (min with one day)
5. build lines per project: label = project name or "Unassigned", unitLabel from mode
6. subtotal = sum(line amounts); tax = round(subtotal * bp / 10_000); total = subtotal + tax
7. roundingNote: "Rounded to the nearest 15 minutes, per day" (from the rule, i18n key in the app)
8. draftLabel: 'Draft'
```

`roundingNote` is generated here in English from the rule so the CSV/print output is consistent; the
web app may translate it by re-deriving from `roundingRule`, never by string-matching the note.

## 8. Errors

| Situation | Behaviour |
|---|---|
| no confirmed block | valid draft, zero lines (not an error) |
| block with `end <= start` | filtered out before grouping |
| `stepMinutes <= 0` | treated as `none`; a warning is added to `freeTextNotes` |
| negative rate or `dayRateCents < 0` | rejected by `clientSchema` before reaching here |
| tax rate out of `[0, 10_000]` | clamped, note added |
| period with no day | zero lines |

No throw: the draft is always buildable, because an unbillable period is a normal state (Sofia's
first visit).

## 9. Properties to test

| Property | Test | Shape |
|---|---|---|
| **HEU-P-08** | `rounding.test.ts` | `roundUp(x) >= x`; `round(round(x)) === round(x)`; `x === 0 → 0`; seeds `20261108` |
| **HEU-P-09** | `draft.test.ts` | `subtotal === sum(lines)`; recomputing a line from its blocks gives the same amount; seeds `20261109` |
| **HEU-P-10** | `modes.test.ts` | `thresholdQuantity(x) ∈ {0, 0.5, 1}` for any `x`, seeds `20261110` |
| cap | `caps.test.ts` | no day exceeds one day per client |
| idempotence of the whole draft | `draft.test.ts` | `draft(draft input)` twice → deep equal |
| JSON round trip | `exports.test.ts` | `parseDataset(JSON.parse(exported))` deep-equals the dataset |

Generators:

```ts
export const arbRounding = fc.record({
  mode: fc.constantFrom('none', 'nearest', 'up'),
  stepMinutes: fc.constantFrom(1, 5, 6, 10, 15, 30, 60),
  scope: fc.constantFrom('session', 'day', 'total'),
});
export const arbBlock = fc.record({ start: arbInstant, minutes: fc.integer({ min: 0, max: 900 }) })
  .map(({ start, minutes }) => makeBlock(start, minutes));
export const arbClient = fc.record({
  mode: fc.constantFrom('hourly', 'daily-thresholds', 'daily-proportional'),
  rateCents: fc.integer({ min: 2000, max: 20_000 }),
  dayRateCents: fc.integer({ min: 20_000, max: 120_000 }),
});
```

## 10. Boundaries

| Consumer | Uses |
|---|---|
| `apps/web` invoice screen | `draftInvoice`, `buildAnnex`, the exports |
| `apps/web` month screen | nothing (the counter is computed from blocks, not from a draft) |
| `sessionizer` | nothing — the dependency runs the other way |

The package never mutates its input: `markPeriodBilled` returns new blocks.
