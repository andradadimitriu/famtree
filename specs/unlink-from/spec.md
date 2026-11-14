# famtree — Spec

## Summary

An "Unlink from" control, right next to [link-relationships](../link-relationships/spec.md)'s
"Link to" button in `PersonPanel`'s Actions section, removes a
relationship `X` (the open person) has to someone else — a parent, a
child, or a spouse — without deleting either person. This is the control
`link-relationships` explicitly deferred ("no unlink control... today,
undoing a link requires deleting one of the two people").

## Why

- `link-relationships` lets two people be connected, but the only way to
  undo a mistaken or outdated link today is to delete a whole person —
  destructive, and impossible when the person has other relationships
  worth keeping.
- The "Child of" option in `link-relationships`' own form is disabled
  once a person already has two parents, with a message pointing at
  unlinking first. That message currently has nothing to point to.

## The shared primitive: detaching one child from one parent

Every branch below reduces to the same operation, just entered from
either side of the relationship: **remove the link between child `C`
and parent `P`, where `P` is one of `C`'s (up to two) recorded parents**,
reusing [link-relationships](../link-relationships/spec.md)'s helpers
and golden rule throughout (never create a marriage duplicating one that
already exists):

- Look up `C`'s current marriage `M` (via `parentage`) and `P`'s
  co-parent `Q` on it, if any (`M.spouses` minus `P`).
- If `Q` exists: `findIncompleteMarriage(Q)` — reuse if found, else
  create `{ spouse1Id: Q, spouse2Id: null }`. Reassign `C`'s `parentage`
  row to that marriage. `C` keeps `Q` as a known parent; `P` becomes
  unrecorded for `C`. `M` itself is untouched (any other children on it
  keep both parents as before).
- If `Q` doesn't exist (`P` was `C`'s only recorded parent): delete `C`'s
  `parentage` row outright. `C` goes to zero recorded parents.

"Parents" (below) enters this with `C = X` and `P` chosen from X's own
recorded parents. "Children" enters it with `P = X` and `C` chosen from
X's own children.

## Relationship rules

Dropdown order: pick a category (**Parents** / **Children** / **Spouse**),
then, depending on it and `X`'s current state, a target. A category with
nothing to unlink is disabled, same treatment as `link-relationships`'
disabled "Child of".

### 1. Unlink a parent

Disabled when `getParentState(X)` is `'none'`.

**a. `getParentState(X)` is `'one'`.** No dropdown — the single known
parent is shown read-only ("Parent 1 is autocompleted," per spec-me),
confirm removes them: delete `X`'s `parentage` row. `X` goes to zero
parents. (The now-childless marriage is left as-is, same accepted
rough edge `deletePerson` already leaves behind elsewhere.)

**b. `getParentState(X)` is `'two'`.** Both of `X`'s actual recorded
parents are shown, each with its own checkbox — at least one required.

- Both checked: delete `X`'s `parentage` row outright. `X` goes to zero
  parents.
- One checked: apply the shared primitive above with `C = X`, `P` = the
  checked parent (`Q` = the other, unchecked one). `X` keeps the
  unchecked parent; the checked one is removed.

### 2. Unlink a child

Disabled when `X` has no children. Dropdown lists every child linked to
*any* of `X`'s marriages (`X` may have more than one marriage), labeled
`{name}{formatLifespan}`.

- Apply the shared primitive with `P = X`, `C` = the chosen child
  (`Q` = the child's other recorded parent, if any — the co-parent on
  whichever of `X`'s marriages that child is attached to).

### 3. Unlink a spouse

Disabled when `X` has no complete marriage (a marriage with both spouses
known — an "Unknown"-placeholder marriage isn't offered here; there's no
real spouse to unlink from, and cleaning up a stray placeholder isn't
this feature's job). Dropdown lists the other spouse on each of `X`'s
complete marriages.

- Look up the chosen marriage `M`'s children (via `parentage`).
- **No children on `M`:** delete `M` outright (and any `marriageId`-linked
  photos on it, same cleanup `deletePerson` already does for a marriage
  it removes).
- **`M` has children:** ask which parent keeps them — `X` or the other
  spouse — a single choice for the whole marriage, not per child. Once
  chosen (`keep` = that parent): `findIncompleteMarriage(keep)` — reuse
  if found, else create `{ spouse1Id: keep, spouse2Id: null }`. Reassign
  *every* child's `parentage` row from `M` to it. Then delete `M` (now
  childless) and its photos.

## UI

- "Unlink from" button beside "Link to" in `PersonPanel`'s Actions
  section (both above "Delete node"). Same inline-form pattern: click →
  form replaces the button row.
- Category dropdown first (Parents / Children / Spouse); disabled
  options get a reason suffix, same convention as `link-relationships`'
  disabled "Child of" (e.g. "Parents — none recorded").
- The second part of the form depends on the category and, for Parents,
  on `getParentState(X)` — read-only confirmation (one parent), two
  checkboxes (two parents), a single dropdown (a child), or a dropdown
  plus a conditional "who keeps the children?" radio choice (a spouse
  whose marriage has children).
- A short confirmation line names what's about to happen (e.g. "Remove
  Henry Whitfield as a parent of Eleanor Whitfield?") before the
  destructive action runs — this has no automatic undo, unlike a
  field edit, so it gets the same weight as "Delete node"'s confirm
  step rather than `link-relationships`' plain Save.
- Save is pending-disabled ("Unlinking…"); errors render inline the same
  way the rest of the panel's forms do. Cancel discards the in-progress
  selection; switching to a different person while the form is open
  resets it closed, matching every other panel form.
- On success, the form collapses back to the action buttons.

## Data model / mutation

- New Server Action `unlinkPerson(personId, prevState, formData)` in
  `src/db/actions.js`, alongside `linkPerson`. `formData` carries
  `category` (`'parents' | 'children' | 'spouse'`), plus:
  `removeParentId` (parents, one or two values via `formData.getAll`),
  `childId` (children), or `spouseId` plus an optional `keepParentId`
  (spouse, required only when that marriage has children).
- `createMarriage`/`findIncompleteMarriage`-style helpers currently live
  as closures inside `linkPerson` — pulled out to module-level private
  helpers in `actions.js` so `unlinkPerson` can reuse them instead of
  re-implementing the same "create or reuse an incomplete marriage"
  logic a second time.
- Returns `{ error, ...getTreeData() }`, matching every other structural
  mutation — the caller feeds this into the existing `onTreeMutated`
  prop, which already knows how to rebuild the tree and reset collapse
  state. No new propagation mechanism needed.

## Validation

All server-side, re-run regardless of what the UI already restricted:

- `category` must be one of the three values.
- Parents: every id in `removeParentId` must actually be one of `X`'s
  current recorded parents (looked up via `getParentState`/the
  marriage it points to) — not an arbitrary person id.
- Children: `childId` must actually be a child on one of `X`'s
  marriages.
- Spouse: `spouseId` must actually be the other spouse on one of `X`'s
  complete marriages; if that marriage has children, `keepParentId` is
  required and must be either `personId` or `spouseId`.

## Out of scope

- Removing a stray "Unknown"-placeholder marriage that was never filled
  in — no real spouse to unlink from (see "Unlink a spouse" above).
- Per-child custody splitting when unlinking a spouse — one parent keeps
  every child from that marriage, not a per-child choice.
- Undo — there's no history/redo; re-establishing a removed relationship
  means using "Link to" again.
- Permission checks — matches every other mutation in this codebase
  until [accounts-and-trees](../accounts-and-trees/spec.md) lands.
