# Tasks — `review-ui`

Design-first spec: the design document is the input, the tasks below execute it. Ordered by
dependency, smallest verifiable steps.

## 1. Foundations

- [ ] 1.1 `apps/web/src/i18n/en.ts` and `fr.ts` with the full key set; `t()` helper; a type that
      forces `fr` to mirror `en`. Verify: `i18n.test.ts` — same keys both sides.
- [ ] 1.2 `styles/tokens.css`: surface, text, accent, three status treatments (opacity, border,
      hatch), focus ring, tabular numbers. Verify: contrast checked manually, values in the notes.
- [ ] 1.3 `state/reducer.ts` with the action union of the design; pure, no I/O.
      Verify: `reducer.test.ts` — confirm, adjust, reject.
- [ ] 1.4 `state/persist.ts`: debounced `localStorage` write, `parseDataset` on read.
      Verify: round trip test with jsdom.

## 2. The block chip (the art direction lives here)

- [ ] 2.1 `components/StatusLabel.tsx`: text + class per status, no colour-only signal.
      Verify: `StatusLabel.test.tsx`.
- [ ] 2.2 `components/Seam.tsx`: SVG seam with one glyph per evidence item (dot / bar / quill),
      positioned by instant. Verify: snapshot-free test asserting glyph count and type order.
- [ ] 2.3 `week/BlockChip.tsx`: three aspects (opacity, border, hatch) + assumed/proven split with a
      notch. Verify: `BlockChip.test.tsx` asserts class **and** visible label for each status.
- [ ] 2.4 Confirm transition behind `@media (prefers-reduced-motion: no-preference)`.
      Verify: a CSS assertion test or a documented manual check in the notes.

## 3. Week screen and gestures

- [ ] 3.1 `week/WeekGrid.tsx` + `DayColumn.tsx`: geometry from the day's blocks, 15-minute slots.
- [ ] 3.2 Keyboard: roving `tabIndex`, arrows, `Enter`, `Space`, `Escape`, `Home`/`End`;
      `aria-live="polite"` announcement on confirm.
      Verify: `WeekScreen.test.tsx` keyboard-only walk-through.
- [ ] 3.3 Gestures wired to the reducer: confirm, adjust start/end (records observed lead-in),
      split, reassign, reject; locked blocks refuse with a message.
      Verify: one test per gesture.
- [ ] 3.4 Confirm a whole day and a whole week in one action, with a count reported.
      Verify: `confirm-range` test — four blocks → four confirmed.
- [ ] 3.5 `week/WeekTable.tsx`: the equivalent table, linked above the grid, status as text.
      Verify: `WeekTable.test.tsx` — one row per block.

## 4. Block panel (HEU-F-20)

- [ ] 4.1 `week/BlockPanel.tsx`: dialog-like aside, focus trap, `Escape`, focus restored.
      Verify: `BlockPanel.test.tsx`.
- [ ] 4.2 Evidence list grouped by source, sorted by instant, each item with its fields; an evidence
      item without client says so.
      Verify: the five-item fixture (3 commits, 1 checkout, 1 meeting).
- [ ] 4.3 Proven/assumed mini bar and the numbers (`90 % proven · 17 min assumed`).

## 5. Month screen (HEU-F-21, HEU-F-22)

- [ ] 5.1 `month/GhostCounter.tsx`: found / confirmed / ghost / amount, `≈` on the amount, live
      region. Verify: the 104 / 92 case → 12 h, ≈ €780.
- [ ] 5.2 Declared input per client and month; empty state invites, never shows 0.
      Verify: test with and without declared hours.
- [ ] 5.3 `month/MonthGrid.tsx`: one cell per day with minutes and client composition, "over" label
      above `dayLengthMinutes`, click opens the week on that day.
      Verify: the 600-minute day carries the label.

## 6. States

- [ ] 6.1 `EmptyState.tsx` with the *Load the sample month* action (HEU-F-30).
      Verify: first-visit test — no dataset → empty state → one click → month populated.
- [ ] 6.2 `ErrorState.tsx` with message, retry, `<details>` raw error.
      Verify: feed a malformed file, assert the error screen.

## 7. Guards

- [ ] 7.1 `week/selectors.test.ts`: **HEU-P-01** asserted on the rendered model — overlapping blocks
      produce a diagnostic and the screen shows `ErrorState` instead of a wrong grid.
- [ ] 7.2 `grep -rn 'fetch\|XMLHttpRequest\|VITE_' apps/web/src` returns nothing.
      Verify: `node scripts/check-no-network.mjs` green.
- [ ] 7.3 No user-visible literal: a scan of `src/**/*.tsx` for sentences outside `t('…')`.
      Verify: `i18n.test.ts` second assertion.
- [ ] 7.4 `pnpm lint` (jsx-a11y) green on every new component.

## 8. Finish

- [ ] 8.1 Manual keyboard walk-through of the week screen, notes pasted in the task.
- [ ] 8.2 Manual grayscale screenshot of a week with the three aspects — must still be readable.
      Attach to the task notes (not to the repo: it is a verification artefact).
- [ ] 8.3 Render 5 000 blocks and record the duration in `KIRO_JOURNAL.md` (`TODO(measure)` until
      measured).
