# Design — `review-ui`

Design-first (D.13): the interaction and the art direction are settled here, and the requirements
above are read against them.

## 1. Two ideas, carried everywhere

**Ghosts take flesh.** A proposed block floats: translucent fill, dashed outline, a soft offset
shadow. Confirming removes the transparency and the dashes in one 180 ms transition. Nothing else in
the app animates.

**A seam stitches the evidence.** Each block carries a thin seam along its left edge, built from its
evidence instants, with one glyph per source: a dot for a commit, a bar for a meeting, a quill for a
note. Three commits and one meeting show as three dots and a bar. It is the visual proof of O2 and
the thing to point at in the video.

Everything else is a quiet management tool: neutral surface, one accent (the ghost counter), tabular
numbers, 24-hour clock.

## 2. Component tree

```
apps/web/src/
├── app/
│   ├── App.tsx                 routes: month | week | evidence | clients | invoice | settings
│   └── shell/                  header, nav, language switch, data status
├── screens/
│   ├── month/                  MonthScreen, GhostCounter, ClientTable, LoadCalendar
│   ├── week/                   WeekScreen, WeekGrid, BlockChip, DayColumn, WeekTable, BlockPanel
│   └── ...
├── components/
│   ├── Seam.tsx                the evidence seam (SVG, one glyph per evidence item)
│   ├── ConfidenceBadge.tsx     Solid · Likely · To confirm (text + icon, never colour alone)
│   ├── StatusLabel.tsx         Proposed · Confirmed · Conflict · Locked
│   ├── EmptyState.tsx          icon-less, one sentence, one action
│   └── ErrorState.tsx          message + retry + <details> with the raw error
├── state/                      reducer, selectors, persistence
├── i18n/                       en.ts (default), fr.ts, t()
└── styles/                     tokens.css, layout.css, print.css
```

Files stay under 500 lines and functions under 50; `WeekGrid` is the one component that will need
splitting (`WeekGrid` → `DayColumn` → `BlockChip`), which is why the tree is already three deep.

## 3. State

```ts
interface AppState {
  dataset: Dataset | null;        // clients, blocks, conflicts, settings
  evidence: readonly Evidence[];
  view: { screen: Screen; weekStart: Instant; selectedBlockId: string | null };
  locale: SupportedLocale;
  declaredMinutes: Record<string, Minutes | null>;   // per client, per month
  importReport: IcsImportResult | null;
}

type Action =
  | { type: 'load-sample' }
  | { type: 'import-evidence'; payload: Evidence[] }
  | { type: 'confirm-block'; id: string }
  | { type: 'confirm-range'; start: Instant; end: Instant }
  | { type: 'adjust-block'; id: string; start?: Instant; end?: Instant }
  | { type: 'split-block'; id: string; at: Instant }
  | { type: 'reassign-block'; id: string; clientId: string }
  | { type: 'reject-block'; id: string }
  | { type: 'resolve-conflict'; id: string; keep: 'left' | 'right' }
  | { type: 'set-declared'; clientId: string; minutes: Minutes | null }
  | { type: 'set-locale'; locale: SupportedLocale };
```

The reducer is pure and lives in `state/reducer.ts`; every action returns a new state with blocks
re-validated against HEU-P-01 before it is stored. Persistence is a debounced write of the `Dataset`
to `localStorage`, parsed with `parseDataset` on read — never `JSON.parse` alone.

## 4. The week grid

```tsx
<WeekGrid>                     role="grid", aria-label="Week of 3 November 2026"
  <DayColumn day={dayKey}>     role="row", one per day
    <BlockChip block={b} />    role="gridcell", tabIndex={-1 | 0}
      <Seam evidence={…} />
      <StatusLabel status={b.status} />
```

- Geometry: one column per day, y axis from 07:00 to 21:00 by default (the union of the day's blocks,
  widened to the workday), 15-minute slots as the keyboard grid step.
- **Three aspects, four channels**: fill opacity (`0.35` proposed, `1` confirmed, `0.6` + hatch
  conflict), border style (dashed / solid / 2 px double), the text label inside, and `aria-label`
  containing the status word. Colour is a fifth, never the only one.
- **Assumed vs proven**: the block is drawn as two stacked spans — the assumed part at 40 % of the
  block's own opacity, the proven part full. The boundary is a 1 px notch, not a colour change, so it
  survives grayscale.
- **Keyboard**: roving `tabIndex` inside the grid, arrows move by slot or by block, `Enter` opens the
  panel, `Space` confirms, `Escape` closes, `Home`/`End` jump to the first/last block of the day.
  `aria-live="polite"` announces "Block confirmed, 2 h 15".
- **Reduced motion**: the confirm transition is `transition: opacity 180ms` under a
  `@media (prefers-reduced-motion: no-preference)` block only. With `reduce`, the class changes
  instantly.
- **The equivalent table** (`WeekTable`) is a real `<table>` with `<caption>`, one row per block:
  start, end, client, project, status, proven share, evidence count. Reached by a link directly above
  the grid, and it is the structure the acceptance test asserts against.

## 5. The month screen

```
┌──────────────────────────────────────────────────────────┐
│  104 h found · 0 h confirmed · 12 h ghost · ≈ €780       │  GhostCounter
├──────────────────────────────────────────────────────────┤
│  [ day cells of the month, load per day, "over" labels ]  │  MonthGrid
├──────────────────────────────────────────────────────────┤
│  Acme        found 48 h   confirmed 0 h   declared [  ]  │  ClientTable
│  Northwind   found 32 h   confirmed 0 h   declared [  ]  │
│  Globex      found 24 h   confirmed 0 h   declared [  ]  │
└──────────────────────────────────────────────────────────┘
```

- `found` = all blocks (proposed + confirmed), `confirmed` = confirmed only, `ghost` =
  `declared - found` when positive, `≈ amount` = ghost minutes × the client's rate, labelled as a
  potential.
- The declared input is per client and per month; empty means "not declared", which shows an
  invitation, not a zero.
- The counter is the `h1` of the screen; changes are announced in a polite live region.

## 6. The block panel

An `<aside role="dialog" aria-modal="false">` that slides from the right, with a focus trap, `Escape`
to close, and focus returned to the originating chip. Contents:

1. Span, client, project, status, confidence badge.
2. `Proven 90 % · assumed 17 min` with the two spans drawn as a mini bar.
3. The evidence list, grouped by source, each item showing time + the fields of Requirement 3.2.
4. The gestures as buttons: Confirm, Adjust start, Adjust end, Split, Change client, Reject. Each
   button states its keyboard shortcut in a `title` and a visually hidden span.

## 7. i18n

```ts
// i18n/en.ts
export const en = {
  'month.found': '{hours} found',
  'month.confirmed': '{hours} confirmed',
  'month.ghost': '{hours} ghost',
  'month.amount': '≈ {money}',
  'block.status.proposed': 'Proposed',
  'block.status.confirmed': 'Confirmed',
  'block.status.conflict': 'Conflict',
  'block.confidence.solid': 'Solid',
  'block.confidence.likely': 'Likely',
  'block.confidence.toConfirm': 'To confirm',
  'week.viewAsTable': 'View as table',
  'empty.firstVisit': 'Drop your evidence, or load the sample month to see how it works.',
} as const;
```

`fr.ts` mirrors every key (TypeScript enforces it: `Record<keyof typeof en, string>`). No string
literals in components; `t('key', params)` interpolates. Formatting goes through core:
`formatHours`, `formatMoney`, `formatDate`, `formatTime`, `formatMinutes`.

## 8. Accessibility checklist (verified before each screen is called done)

- [ ] every interactive element reachable and operable by keyboard, in a logical order;
- [ ] focus visible (`:focus-visible` with a 2 px outline, contrast ≥ 3:1);
- [ ] status never carried by colour alone (label text present in the DOM);
- [ ] contrast AA: body 4.5:1, large text and boundaries 3:1 — checked on the translucent states;
- [ ] `prefers-reduced-motion` respected;
- [ ] the equivalent table exists and is linked;
- [ ] `pnpm lint` (jsx-a11y) green;
- [ ] the DOM test drives the screen with `user-event` keyboard only.

## 9. Tests

| Test | File | What it proves |
|---|---|---|
| keyboard review | `week/WeekScreen.test.tsx` (`// @vitest-environment jsdom`) | Tab → arrows → Enter → Space confirms a block, focus visible |
| three aspects | `week/BlockChip.test.tsx` | each status renders a distinct border class **and** a text label |
| equivalent table | `week/WeekTable.test.tsx` | one row per block, status as text |
| counter | `month/GhostCounter.test.tsx` | 104 / 92 → 12 h and ≈ €780, live region updated |
| no string outside i18n | `i18n/i18n.test.ts` | `en` and `fr` have the same keys; a scan of `src/**/*.tsx` finds no literal sentence |
| **HEU-P-01** on the model | `week/selectors.test.ts` | if two blocks overlap, the selector throws a diagnostic and the screen shows the error state instead of a wrong grid |

## 10. Boundaries

`apps/web` renders and dispatches; it never implements reconstruction, rounding or time arithmetic.
Every computation comes from `@ghost-hours/{intervals,sessionizer,billing,core}`. When a screen seems
to need a local calculation, the calculation belongs in a package.
