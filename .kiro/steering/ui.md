---
inclusion: fileMatch
fileMatchPattern: "apps/web/**"
---

# Ghost Hours — UI steering (D.11, HEU-N-04, HEU-N-05)

## Screens

1. **Month** — the ghost-hours counter, the load per day, the clients.
2. **Week** — the block grid. A proposed block is translucent with a dashed border; a confirmed
   block is solid; a conflict is hatched. The assumed part of a block is paler than its proven part.
3. **Evidence** — the side panel of one block: its commits, its meetings, its notes.
4. **Clients and rules.**
5. **Invoice draft.**
6. **Settings** — D.5 parameters, language, export and erase-all.

## Art direction: two ideas, nothing more

**Ghosts that take flesh.** A proposed block floats: translucent fill, dashed outline, slightly
offset shadow. Confirming it removes the transparency and the dashes — the ghost becomes solid, in
one 180 ms transition. That is the whole motion language of the product; use it nowhere else.

**A seam along every block.** Each block carries a thin seam on its left edge that stitches its
evidence together, with one glyph per source:

| Source | Glyph | Meaning |
|---|---|---|
| commit | a dot `•` | something was finished at that instant |
| meeting | a bar `▬` | a known start and end |
| note | a quill `✎` | a written trace |

The seam is drawn from the evidence instants, so a block with three commits shows three dots. It is
the visual proof of O2 and it is also the thing to point at in the demo.

**The rest is a clear management tool.** Neutral surface, one accent for the ghost counter, tabular
numbers, 24-hour clock. No ornament beyond the two ideas above. The counter of the month is the
hero element: *found · confirmed · ghost · amount*.

Palette must survive AA contrast on the surface it sits on (4.5:1 for body text, 3:1 for large
text and UI boundaries). Check the translucent states specifically — transparency is where contrast
goes to die. Prefer raising opacity over lightening the text.

## Accessibility — AA, HEU-N-04

- **Keyboard**: the week grid is fully operable — arrow keys move between slots, `Enter` opens a
  block, `Space` confirms, `Escape` closes the panel. Every gesture available by drag must exist as
  a keyboard command and as a button in the block panel.
- **Never colour alone**: proposed / confirmed / conflict differ by *three* aspects — fill opacity,
  border style (dashed / solid / hatched), and the text label inside the block (`Proposed`,
  `Confirmed`, `Conflict`). A user with achromatopsia must read the grid.
- **An equivalent table**: the same week, as a real `<table>` with one row per block (start, end,
  client, project, status, proven share, evidence count). Reachable by a link above the grid, not
  hidden in a menu. This is what screen readers and the acceptance test use.
- **`prefers-reduced-motion`**: no transition, no float, no shadow animation; states change
  instantly. Respect the media query in CSS, not in JS.
- Semantic landmarks (`main`, `nav`, `aside`), one `h1` per screen, labelled form controls, visible
  focus ring (`:focus-visible`, never `outline: none` without a replacement).
- Live regions for the counter when a block is confirmed (`aria-live="polite"`), so the number is
  announced.
- The evidence panel is a `dialog`-like aside with focus trap and `Escape` to close; focus returns
  to the block that opened it.

## i18n — HEU-N-05

- English is the default and the submission language. French is a full second dictionary, not a
  half-translated extra.
- Every user-visible string goes through the dictionary (`apps/web/src/i18n/en.ts`, `fr.ts`). No
  literal text in a component, no concatenation of sentence fragments.
- Locale decides money format, date format and clock: 24-hour clock in both `en-GB`-style and `fr`,
  never `AM/PM` unless the locale demands it. Use `formatMoney`, `formatDate`, `formatTime`,
  `formatDayLabel` from `@ghost-hours/core` — never `toLocaleString()` by hand.
- Durations read `1h30` / `45m` (`formatMinutes`) and hours `104.0 h` (`formatHours`).
- Numbers are tabular (`font-variant-numeric: tabular-nums`) so columns do not jitter.

## States

Every screen has: empty (what to do next, no invented number), loading (only for file parsing —
there is no network, so no spinner over a request), error (what failed, what to do, the raw message
behind a disclosure), and populated. A screen without an empty state is unfinished.

## Non-negotiable

- No network call, no remote font, no icon CDN, no analytics (HEU-N-01). Inline SVG or a system
  font stack.
- No number shown as earned before confirmation (see `prudence.md`).
- The draft screen carries `Draft` and no invoice number (HEU-F-25).
