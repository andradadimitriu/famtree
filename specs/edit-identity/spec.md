# famtree — Spec

## Summary

Let a person's name, birth date, and death date be edited from the tree,
the same way [person-details](../person-details/spec.md) already lets the
bio be edited: a pencil icon in `PersonPanel`'s header swaps the read-only
heading for a small form, each field with a visible text label. Dates are
genealogical records, which aren't always known to full precision — "born"
and "died" each accept a bare year, a year and month, or a full date, not
just a year number.

## Why

- Today there's no way to fix a mistyped name or a wrong/missing birth date
  short of editing the database directly.
- `PersonPanel` already has the exact pattern to copy (pencil icon → inline
  form → Save/Cancel, per the bio editor), so this is mostly wiring, not
  new UX to invent.
- A plain year number can't represent "June 1930" or "June 15, 1930" — real
  genealogical sources frequently give a month or a full date, and forcing
  everything down to a year would throw that away.

## Scope

- A pencil icon next to `PersonPanel`'s heading (`{name} (b. …, d. …)`),
  matching the existing "Edit bio" icon/placement. Clicking it swaps the
  heading for a labeled form: "Name" (text, required), "Born" (text,
  optional), "Died" (text, optional).
- **Partial-precision dates.** `born`/`died` are stored as the matching
  prefix of ISO 8601 — `"1930"`, `"1930-06"`, or `"1930-06-15"` — rather
  than a year integer or a full calendar date. One text column each,
  parsed/formatted by a new shared `src/lib/partialDate.js`
  (`parsePartialDate`/`formatPartialDate`), not three separate year/month/
  day columns — the stored value is already sortable and unambiguous as
  plain text, so splitting it into parts would add modeling with no
  benefit.
- `people.born` changes from an integer column to text (same column,
  different type); new `people.died` text column.
- New action, `updatePersonIdentity(personId, prevState, formData)` in
  `src/db/actions.js`, alongside `updatePersonBio`: validates (via
  `parsePartialDate`) and writes `people.name`/`people.born`/`people.died`.
- Propagating the edit into the already-rendered tree — see **Propagation**
  below; this is the one non-obvious part of an otherwise small feature.

## Validation

- Name: required, trimmed, rejected if empty.
- Born, died: each optional; if given, must match `YYYY`, `YYYY-MM`, or
  `YYYY-MM-DD`, with a real month (01–12) and a day that exists in that
  month. No cross-check that death is after birth — a typo'd date is the
  user's problem to notice and fix, same as today's seed data has no
  validation either.

## UI

Mirrors the bio editor's interaction shape exactly:

- Pencil icon → inline form (labeled name, born, and died text inputs,
  each with a placeholder showing the accepted formats, Cancel/Save).
- Save is pending-disabled ("Saving…"), errors render the same way
  `bioError` does — including a `parsePartialDate` format error (e.g. "Use
  a year (1930), year-month (1930-06), or full date (1930-06-15)").
- Cancel discards the in-progress edit and restores the read-only heading.
- Switching to a different person while mid-edit resets to read-only, same
  as `isEditingBio` already resets on `personId` change.
- The read-only heading renders through `formatPartialDate`: `"1930"` as
  `b. 1930`, `"1930-06"` as `b. Jun 1930`, `"1930-06-15"` as
  `b. Jun 15, 1930`.

## Propagation

This is the part the bio editor didn't have to deal with. Bio only appears
in `PersonPanel`, which already reads fresh data on every request
(`peopleDetails` is rebuilt from the DB on each render — see its comment in
`queries.js`). Name and birth date, though, are also baked into
`FamilyTree.jsx`'s D3 hierarchy source (`rootDataRef.current`), which:

- is built **once** (`if (!rootDataRef.current)`) from the first
  `people`/`marriages`/`parentage` props and never rebuilt — only mutated
  in place for collapse state (`handleToggleMarriage`, etc.) — so a later
  `peopleDetails` refresh never reaches it.
- is **not deduped by person id** (`familyGraph.js`'s `buildPerson` creates
  a fresh `{ id, name, born, ... }` object every time a person is
  referenced) — the same person can exist as several independent node
  objects: themselves in the main hierarchy, a spouse's own ancestor
  object, etc. Fixing the name in one spot wouldn't fix it everywhere that
  person's card renders.

So a save doesn't rely on the next fetch — it patches the live tree
directly, the same "mutate the frozen data, then bump `version`" pattern
`handleToggleMarriage`/`handleToggleAncestors` already use:

- A new `patchPersonInTree(root, personId, { name, born })` walk in
  `FamilyTree.jsx`, shaped like the existing `hideSubtree`/
  `collapseBelowDepth` walks (recurse through `marriages[].spouse`,
  `marriages[].children`, `parents`/`_parents`), updating `name`/`born` on
  every node whose `id === personId`.
- `FamilyTree` passes a new `onPersonUpdated(personId, { name, born })`
  prop down to `PersonPanel` (alongside the existing `onSelectPerson`).
  On a successful save, `PersonPanel` calls it; `FamilyTree` runs the patch
  and `setVersion((v) => v + 1)` to re-render with the corrected cards.
- Rebuilding `rootDataRef.current` from scratch instead was considered and
  rejected — it would also reset every expand/collapse toggle currently
  open, since that state lives mutated onto the same object graph.

## Out of scope

- Editing any other field (gender, etc.) — not modeled yet.
- Renaming a person's `id` — ids are structural (referenced by
  `marriages`/`parentage` rows); changing one is a different, riskier
  operation than editing display fields.
- Deduping `familyGraph.js`'s output generally — `patchPersonInTree` is a
  targeted fix for this one mutation, not a structural change to how the
  tree is built.
- Cross-person validation (e.g. flagging a child's birth year predating a
  parent's) — fields are validated independently.
- Permission checks — out of scope until
  [accounts-and-trees](../accounts-and-trees/spec.md) lands; at that point
  `updatePersonIdentity` needs the same owner/editor check specced there
  for `updatePersonBio`.

## Implementation note: migrating a column type on SQLite

Changing `people.born`'s column type (integer → text) is a "recreate the
table" migration on SQLite (no `ALTER COLUMN TYPE`), and `people` is
referenced by foreign keys from `marriages`/`parentage`/`photos`. The
generated migration's `PRAGMA foreign_keys=OFF` is silently a no-op here —
SQLite ignores that pragma inside a transaction, and both `drizzle-kit
migrate` and `drizzle-orm`'s `migrate()` always wrap pending migrations in
one. The `DROP TABLE people` step then fails with `FOREIGN KEY constraint
failed`. Worked around this once by applying the generated SQL directly via
`db.exec()` (which runs outside an explicit transaction, so the pragma
takes effect) and hand-inserting the matching `__drizzle_migrations` row so
the CLI's bookkeeping stays accurate. Any future migration that changes a
`people` column's type will hit the same issue and need the same
workaround.
