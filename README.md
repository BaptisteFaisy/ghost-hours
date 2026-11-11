# ghost-hours

Ghost Hours — reconstruct the hours you actually worked from Git commits, calendar and notes, then draft an invoice. Kiroween 2026, Frankenstein category.

## Pipeline

File de merge Mergify (rebase, historique linéaire) + balayeur `pr-auto-merge` :
checks requis `ci`, `ci-budget` (jobs ≤ 5 min), `couche0` (garde `## Scope`).

- Runners self-hosted r630 : `r630-ghost-hours-01..NN` (label `__WORKER__`).
- Toute PR porte une section `## Scope` (puces `- `fichier``) listant ses
  fichiers ; les workflows sont des fichiers de garde (`SAMVISION_ALLOW_GUARD_BUMP`).
- Conflits : agent Fireworks ; tests rouges : agent zeroclaw `fw` via `triage-rouge`.
- `main` est protégée (ruleset) : tout passe par PR + file, jamais de push direct.
