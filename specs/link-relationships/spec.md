# famtree — Spec

## Summary

A "Link to" control in `PersonPanel`'s Actions section (above "Delete
node") lets the user connect the open person (`X`) to another existing
person already in the tree, as one of three relationships: **Child of**,
**Parent of**, or **Spouse of**. This is the first way to *add* a
relationship between two existing people — until now, relationships only
ever came from seed data or from [add-remove-people](../add-remove-people/spec.md)'s
`deletePerson` removing them.

## Why

- Real genealogical research is incremental: you often add a person first
  (or they already exist from a different branch) and only later discover
  how they connect to someone else already in the tree. There's currently
  no way to express that discovery without editing the database directly.
- The `people`/`marriages`/`parentage` model
  ([people-and-relationships](../people-and-relationships/spec.md)) already
  supports every shape this needs (incomplete marriages, shared marriages
  across siblings) — this spec is about safely *writing* into that model
  from the UI, not changing it.

## Relationship rules

All three relationships are expressed from `X`'s panel: "X Child of
\_\_\_", "X Parent of \_\_\_", "X Spouse of \_\_\_". `getParentState(personId,
marriages, parentage)` (already in `src/lib/parentState.js`) reports
whether a person has `'none'`, `'one'`, or `'two'` recorded parents, and is
reused here — both to decide what the UI offers and to re-validate
server-side.

Two shared helpers, added alongside `getParentState` in `parentState.js`,
back every rule below:

- `findMarriage(marriages, idA, idB)` — an existing marriage whose spouses
  are exactly `{idA, idB}` (in either order), or `undefined`.
- `findIncompleteMarriage(marriages, personId)` — an existing marriage
  where `spouse1Id === personId && spouse2Id === null`, or `undefined`.
  (The known spouse of an incomplete marriage is always `spouse1Id` —
  `spouse2Id` is the schema's only nullable slot.)
- `marriageHasChildren(marriageId, parentage, excludingChildId)` — whether
  any parentage row other than the one being moved already points at that
  marriage.

**Golden rule, applied by every branch below: never create a marriage
duplicating one that already exists.** Before creating or filling a
marriage for a given pair (or a given single known parent with the other
left unknown), look for a match first and reuse it instead.

### 1. X Child of \_\_\_

Disabled in the relationship dropdown (with a reason, e.g. "Child of —
already has 2 parents") when `getParentState(X)` is `'two'`. Re-checked
server-side regardless — a disabled UI option is not the enforcement.

**a. `getParentState(X)` is `'none'`.** Form shows "Parent 1" (required)
and "Parent 2" (optional, with an "Unknown" choice, which is the default), both excluding `X`
itself and each other.

- Parent 2 given: `findMarriage(parent1, parent2)` — reuse if found,
  else create `{ spouse1Id: parent1, spouse2Id: parent2 }`.
- Parent 2 left unknown: `findIncompleteMarriage(parent1)` — reuse if
  found, else create `{ spouse1Id: parent1, spouse2Id: null }`.
- Insert a `parentage` row `{ marriageId, childId: X }`.

**b. `getParentState(X)` is `'one'`** (known parent `P`, existing
incomplete marriage `M1`). Form shows a single required "Other parent"
dropdown (`Q`) — the full people list, no exclusions beyond `X` and `P`
themselves.

- `findMarriage(P, Q)` — if found (`M2`), reassign `X`'s existing
  `parentage` row from `M1` to `M2`. `M1` is left untouched (it may end up
  with no children left, which is harmless).
- Otherwise: if `M1` has no other children, fill its gap
  (`spouse2Id = Q` on `M1`, same row). If `M1` already has another child,
  filling the gap would silently reassign that child's second parent too
  — instead create a new marriage `{ spouse1Id: P, spouse2Id: Q }` and
  reassign `X`'s `parentage` row to it.

### 2. X Parent of \_\_\_

Target dropdown (`Y`) lists every other person except `X`, excluding
anyone whose `getParentState` is `'two'`. Re-checked server-side.

**a. `getParentState(Y)` is `'none'`.** `findIncompleteMarriage(X)` — reuse
if found (attach `Y` there), else create `{ spouse1Id: X, spouse2Id: null
}`. Insert `parentage` row `{ marriageId, childId: Y }`.

**b. `getParentState(Y)` is `'one'`** (known parent `P`, marriage `M1`) —
exactly the mirror of 1b, with `X` playing the role of `Q`:
`findMarriage(P, X)` reused if found; else fill `M1`'s gap with `X` if `Y`
is `M1`'s only child, otherwise create a new marriage `{ spouse1Id: P,
spouse2Id: X }` and reassign `Y`'s `parentage` row to it.

### 3. X Spouse of \_\_\_

Dropdown (`Y`) lists every other person except `X` and anyone already
married to `X` (any existing marriage pairing the two, complete or not —
i.e. excluded whenever `findMarriage(X, Y)` would hit).

- `findIncompleteMarriage(X)`: if found **and it has no children**, fill
  its gap (`spouse2Id = Y`). Otherwise (none found, or found but it
  already has children attached) create a new marriage
  `{ spouse1Id: X, spouse2Id: Y }`.
- No `parentage` row — this relationship alone never touches a child.

### Explicitly not handled

- **No cycle prevention** (spec-me's own note) — e.g. nothing stops
  marrying your own descendant, or making your own child your parent.
  Rough edge, accepted as-is.
- **No unlink control.** The disabled "Child of" option's implied fix
  ("unlink a parent first") has no UI yet — that's future work, not part
  of this spec. Today, undoing a link requires deleting one of the two
  people.

## UI

- "Link to" button in `PersonPanel`'s Actions section, above "Delete
  node" — same inline-form pattern as the existing identity/bio editors
  (click → form replaces the button row → Save/Cancel), not a modal.
- Relationship dropdown first (Child of / Parent of / Spouse of); the
  second part of the form — one or two person dropdowns — changes shape
  based on the relationship **and**, for Child of, on `X`'s current
  `getParentState`. Dropdown options render as `{name}{formatLifespan}`
  for disambiguation, sorted by name.
- Save is pending-disabled ("Linking…"); errors render inline the same
  way `identityError`/`bioError` do. Cancel discards the in-progress
  selection. Switching to a different person while the form is open
  resets it closed, matching the existing `lastPersonId` reset block.
- On success, the form collapses back to the action buttons (no separate
  confirmation step needed — unlike delete, a link isn't destructive).

## Data model / mutation

- New Server Action `linkPerson(personId, prevState, formData)` in
  `src/db/actions.js`, alongside `deletePerson`. `formData` always
  carries `relationship` (`'child-of' | 'parent-of' | 'spouse-of'`), plus,
  depending on it: `parent1Id`/`parent2Id` (child-of, no existing
  parent), `otherParentId` (child-of, one existing parent), `childId`
  (parent-of), or `spouseId` (spouse-of).
- Implements the branches above using `getTreeData()`'s already-loaded
  `marriages`/`parentage` plus the new `findMarriage`/
  `findIncompleteMarriage`/`marriageHasChildren` helpers.
- Returns `{ error, ...getTreeData() }`, matching `deletePerson` — the
  caller feeds this straight into the existing `onTreeMutated` prop
  (`FamilyTree.jsx`'s `handleTreeMutated`), which already knows how to
  rebuild `rootDataRef.current` from fresh `people`/`marriages`/
  `parentage` and reset collapse state. A link is structural the same way
  delete is, so no new propagation mechanism is needed.
- `PersonPanel` needs the full `people`/`marriages`/`parentage` it
  currently doesn't receive (only `peopleDetails`) — `FamilyTree.jsx`
  passes its own `people`/`marriages`/`parentage` props down to
  `<PersonPanel>` alongside the existing props, to populate dropdowns and
  run `getParentState` client-side for the UI shape.

## Validation

All server-side, re-run regardless of what the UI already filtered:

- `relationship` must be one of the three values; every referenced person
  id must exist and must not equal `personId` (no linking to self).
- Child-of: reject if `getParentState(X)` is `'two'`. If `'none'`,
  `parent1Id` required; `parent2Id`, if present, must differ from
  `parent1Id`. If `'one'`, `otherParentId` required and must differ from
  the known parent.
- Parent-of: reject if `getParentState(childId)` is `'two'`.
- Spouse-of: reject if `findMarriage(personId, spouseId)` already exists
  (already married to each other).

## Out of scope

- Any unlink/remove-a-single-relationship control (see "Explicitly not
  handled" above).
- Cycle prevention of any kind.
- Permission checks — matches every other mutation in this codebase until
  [accounts-and-trees](../accounts-and-trees/spec.md) lands.
- Linking to a brand-new person who doesn't exist yet — this only
  connects two people already in the tree; creating a new person is a
  separate concern ([add-remove-people](../add-remove-people/spec.md)).
