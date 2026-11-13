---
inclusion: always
---

# Ghost Hours — prudence steering (D.5)

The tool proposes, the human confirms. That single sentence is the product's ethics and its
architecture. Everything below follows from it.

## The rule

- **Propose, never inflate.** A block exists because evidence exists. You may *extend* a block
  backwards by an assumed lead-in (`leadInDefault`), and that extension must be **marked as
  assumed** — never presented as proof.
- **Only confirmed blocks are billable.** `draftInvoice()` takes `status === 'confirmed'` blocks.
  A `proposed`, `conflict` or `rejected` block contributes zero minutes, always, in every mode.
- **The draft stays a draft.** `draftLabel: 'Draft'`, no invoice number, no "final" wording, no
  archiving claim. The user re-keys it in their own tool.
- **Show what is assumed.** `provenShare` and `assumedLeadInMinutes` are part of the `Block` type
  for this reason: the UI draws the assumed part lighter, the annex can say so, the reviewer can
  see it. A block whose assumed part is hidden is a bug.
- **Round against yourself, not for yourself.** The rounding rule is chosen by the client's
  settings and printed on the draft. Default is `nearest`, 15 minutes, per day. `up` exists but is
  never the default and never silent.
- **When two sources disagree, stop and ask.** That is a `Conflict`, not a clever merge. Do not
  invent a tie-break rule that quietly favours the client that pays more.
- **Never add time that no source supports.** No "you probably worked the afternoon too". No
  padding to reach a round number. No filling gaps because the day looks empty.

## In code

```ts
// right: the assumption is a field, and the caller can see it
const block: Block = {
  …,
  status: 'proposed',
  provenShare: provenMinutes / totalMinutes,
  assumedLeadInMinutes: leadIn,
  confidence: levelFromShare(provenShare),
};

// wrong: a session quietly widened to a tidy hour, with nothing saying so
const end = roundUpToHour(lastCommit.at);
```

- Any function that widens an interval must say how much it widened, in minutes, in the returned
  value or in a named field.
- Any default (90 min gap, 30 min lead-in, 7 h workday) lives in `DEFAULT_SETTINGS` and is shown
  in the settings screen. No magic number buried in a module.
- Calibration (HEU-F-17) proposes a new default; it never applies it silently. The user accepts.

## In the UI

- Proposed blocks are translucent ghosts; confirmed blocks are solid; conflicts are hatched. The
  assumed part of a block is paler than its proven part. This is not decoration — it is the
  prudence principle made visible (see `ui.md`).
- The month counter never shows a single "you earned" figure as if it were banked: it shows
  *found*, *confirmed*, and *ghost* separately, and the ghost amount is labelled as a potential.
- An empty state says what to do next; it never invents a number.

## In speech and in docs

| Do not say | Say |
|---|---|
| "we detected 104 hours" | "we found evidence for 104 hours" |
| "you lost €780" | "≈€780 of work is not in your declared hours" |
| "invoice generated" | "draft prepared" |
| "the AI knows you worked" | "the evidence suggests a session from 14:02 to 16:40" |

## The risk this answers (D.15)

The strongest objection to this project is that it is a machine for inflating invoices. The answer
is not a disclaimer in the README; it is the invariant *only confirmed blocks are billable*, the
visible assumed share, the block-by-block validation, and the evidence annex. Keep all four. If a
feature weakens any of them, it is the wrong feature.

## Review checklist (used by the `prudence-reviewer` agent)

1. Can any code path bill a block that is not `confirmed`? (must be no)
2. Is every assumed minute visible to the user? (must be yes)
3. Does any default silently round in the user's favour? (must be no)
4. Does the draft carry `Draft` and no number? (must be yes)
5. Is any amount shown as earned before confirmation? (must be no)
