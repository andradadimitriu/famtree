# famtree — Spec

## Summary

An account can have more than one family tree. The header gains a tree
switcher (left) and a "+ New tree" button, matching the left side of
[accounts-and-trees](../accounts-and-trees/spec.md)'s header sketch:

```
┌──────────────────────────────────────────────────────────────┐
│ [My Trees ▾] [+ New tree]                        Family Tree │
└──────────────────────────────────────────────────────────────┘
```

This spec **narrows** the multi-tree half of accounts-and-trees: it adds
trees and the account concept they belong to, but deliberately **not**
auth — no login, no OAuth, no sessions, no sharing. Today there is
exactly one implicit account; everything in `accounts-and-trees` about
sign-in, guests, and owner/editor/viewer roles is still a separate, later
piece of work that can build on top of the `accounts` table this spec
adds. See `accounts-and-trees`'s index entry for that note.

## Why

Today the app hardcodes a single tree: one `people` table, no notion of
which rows belong together, and a single hardcoded root
(`src/db/queries.js`'s `rootId = 'eleanor-whitfield'`). Someone who wants
to track two unrelated families (e.g. both sides of a marriage, or a
second research project) currently has no way to do that without the
trees' data colliding in one pool.

## Data model

```ts
// New — minimal stand-in for a signed-in user. No email, password, or
// auth fields here: this table only exists so `trees.ownerId` has
// something to point at. accounts-and-trees' auth work, when it lands,
// extends this table rather than replacing it.
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// New
export const trees = sqliteTable('trees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => accounts.id),
  // Null until the tree's first person is added — see "Empty trees".
  rootPersonId: text('root_person_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// Changed — gains treeId. Ids are hand-picked slugs (`eleanor-whitfield`)
// for seeded/edited data, so they only need to be unique *within* a tree,
// not globally — two different trees can each have their own
// `john-smith`. That makes `(treeId, id)` the primary key, not `id`
// alone.
export const people = sqliteTable(
  'people',
  {
    id: text('id').notNull(),
    treeId: text('tree_id').notNull().references(() => trees.id),
    name: text('name').notNull(),
    born: text('born'),
    died: text('died'),
    bio: text('bio'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.treeId, t.id] }) }),
)

// Changed — gains treeId. Because people ids are no longer globally
// unique, a bare spouse1Id/spouse2Id can't be resolved to one row
// without also knowing which tree it's in, so treeId is carried here
// directly (and on parentage/photos below) rather than left implicit —
// a deliberate change from accounts-and-trees' original plan, which
// assumed globally-unique ids and could leave these three tables alone.
export const marriages = sqliteTable(
  'marriages',
  {
    id: text('id').notNull(),
    treeId: text('tree_id').notNull().references(() => trees.id),
    spouse1Id: text('spouse1_id').notNull(),
    spouse2Id: text('spouse2_id'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.treeId, t.id] }),
    spouse1Fk: foreignKey({
      columns: [t.treeId, t.spouse1Id],
      foreignColumns: [people.treeId, people.id],
    }),
    spouse2Fk: foreignKey({
      columns: [t.treeId, t.spouse2Id],
      foreignColumns: [people.treeId, people.id],
    }),
  }),
)

// Changed — gains treeId, same reasoning as marriages.
export const parentage = sqliteTable(
  'parentage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    treeId: text('tree_id').notNull().references(() => trees.id),
    marriageId: text('marriage_id').notNull(),
    childId: text('child_id').notNull(),
  },
  (t) => ({
    marriageFk: foreignKey({
      columns: [t.treeId, t.marriageId],
      foreignColumns: [marriages.treeId, marriages.id],
    }),
    childFk: foreignKey({
      columns: [t.treeId, t.childId],
      foreignColumns: [people.treeId, people.id],
    }),
  }),
)

// Changed — gains treeId, same reasoning.
export const photos = sqliteTable(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    treeId: text('tree_id').notNull().references(() => trees.id),
    personId: text('person_id'),
    marriageId: text('marriage_id'),
    filePath: text('file_path').notNull(),
    caption: text('caption'),
    takenYear: integer('taken_year'),
  },
)
```

- `rootPersonId` has no DB-level foreign key (same rationale
  accounts-and-trees gave: it can't be inserted atomically with the
  tree's first person anyway) — enforced at the application layer that
  it names a person whose own `treeId` matches `trees.id`.
- The hardcoded `rootId` constant in `src/db/queries.js` is removed;
  every read of "the root" becomes `trees.rootPersonId` for the tree in
  question.

### Migration

- Create `accounts`, seed exactly one row (`CURRENT_ACCOUNT_ID`, a fixed
  `crypto.randomUUID()` generated once and hardcoded as a constant —
  same pattern `rootId` used before it's replaced).
- Create `trees`, seed one row — name "Family Tree" (today's static
  header text), `ownerId: CURRENT_ACCOUNT_ID`, `rootPersonId:
  'eleanor-whitfield'` (today's hardcoded root).
- Add `treeId` to `people`, `marriages`, `parentage`, `photos`; backfill
  every existing row to that seeded tree's id. Change `people`'s primary
  key from `id` to `(treeId, id)`.

## Empty trees

A brand-new tree has zero people and `rootPersonId: null`. Today's
rendering code (`buildFamilyTree` in `src/data/familyGraph.js`) assumes a
valid root and crashes without one, and `FamilyTree.jsx` calls it
unconditionally on mount — both need a real empty-state path, not just a
new data model:

- `FamilyTree.jsx` (or the page above it) checks `rootPersonId` before
  calling `buildFamilyTree`. `null` renders an empty state: no SVG, just
  the existing "Add person" toolbar/form (already capable of creating a
  standalone person with no relationships) with copy inviting the first
  person.
- `createPerson` gains the rule: if the tree's `rootPersonId` is still
  `null` when a person is created, that new person becomes the root
  (`trees.rootPersonId` is set to them) in the same transaction. Every
  later `createPerson` call on that tree leaves `rootPersonId` alone —
  only the very first person is special.
- Nothing about *how* a root is used downstream changes — once set, that
  tree renders exactly as today's single tree does.

## Mutations (`src/db/actions.js`, `src/db/queries.js`)

- `getTreeData(treeId)` / `getFamilyData(treeId)` — gain a required
  `treeId` param; every query filters on it instead of reading the whole
  table.
- `listTrees()` — new; returns every tree owned by `CURRENT_ACCOUNT_ID`
  (`{ id, name, createdAt }[]`), for the switcher dropdown.
- `createTree(_prevState, formData)` — new Server Action. `formData`
  carries `name`. Validates non-empty (trimmed), inserts a `trees` row
  (`id: crypto.randomUUID()`, `ownerId: CURRENT_ACCOUNT_ID`,
  `rootPersonId: null`). Returns `{ error, tree }`; caller navigates to
  `/trees/[tree.id]` on success.
- `renameTree(treeId, _prevState, formData)` — new Server Action.
  `formData` carries `name`. Validates non-empty and that `treeId` exists
  and is owned by `CURRENT_ACCOUNT_ID`. Updates `trees.name`.
- `deleteTree(treeId)` — new Server Action. Validates `treeId` exists and
  is owned by `CURRENT_ACCOUNT_ID`. Cascades: deletes every photo file for
  photos scoped to `treeId` (reusing the existing per-file delete helper),
  then `photos`, `parentage`, `marriages`, `people`, then the `trees` row
  itself, all scoped to `treeId`. Allowed even when it's the account's
  only remaining tree — deleting it leaves the account with zero trees,
  which the routing below sends back to "create your first tree."
- `createPerson`, `deletePerson`, `linkPerson`, `unlinkPerson`,
  `updatePersonBio`, `uploadPersonPhoto`, `deletePhotoFile`, and every
  other existing mutation gain a `treeId` param (or read it off the
  record they're mutating) and scope their queries to it. `deletePerson`'s
  existing "cannot delete the root person" check compares against that
  tree's `rootPersonId` instead of the old constant.

## Routing

- `app/trees/[treeId]/page.js` — today's `app/page.js` content, scoped to
  one tree. Looks up the `trees` row for `treeId`; missing or not owned by
  `CURRENT_ACCOUNT_ID` → redirect to `/`. Renders the empty state (see
  above) when `rootPersonId` is `null`, otherwise today's tree view.
- `app/page.js` becomes a resolver: redirect to the account's
  most-recently-*created* tree (`listTrees()`, newest `createdAt`), or — if
  there are none — render the "create your first tree" form directly
  (name only; see **Out of scope** for what this does *not* track).
- The header (tree switcher + "+ New tree") lives in `app/layout.js` (or a
  shared wrapper both routes render), visible on both `/` and
  `/trees/[treeId]`.

## Header UI

- **Tree switcher.** Dropdown of `listTrees()`, each row showing the
  tree's name; selecting one navigates to `/trees/[treeId]`. The
  currently-open tree is marked (e.g. checked/highlighted), matching the
  dropdown convention already used elsewhere in the app (link/unlink
  category pickers).
- Each row also carries small rename and delete affordances:
  - **Rename** turns that row's name into an inline text input in place
    (same "click → inline form replaces static content" pattern
    `link-relationships`/`unlink-from` use in the panel); Enter or a save
    control calls `renameTree`, Escape/cancel discards.
  - **Delete** requires a confirmation line naming the tree being
    deleted and that it cannot be undone — same weight as "Delete node"
    and `unlink-from`'s confirmations — before calling `deleteTree`. On
    success, if the deleted tree was the one currently open, navigate to
    `/` (which resolves to another tree or the create-first-tree form).
- **"+ New tree"** button opens a small inline form (name only) beside
  it; submitting calls `createTree` and navigates to the new tree.

## Validation

All server-side, re-run regardless of what the UI already restricted:

- `createTree`/`renameTree`: `name` required (non-empty after trim).
- `renameTree`/`deleteTree`: `treeId` must exist and have
  `ownerId === CURRENT_ACCOUNT_ID`.
- Every per-tree mutation (`createPerson`, `linkPerson`, etc.) only reads
  or writes rows whose `treeId` matches the tree the request is scoped
  to — never a bare `people.id`/`marriages.id` lookup without `treeId`,
  since those are no longer globally unique.

## How existing code reads this

- `src/data/familyGraph.js` (`buildFamilyTree`, `findUnlinkedPeople`) is
  unaffected in shape — still consumes one tree's
  `people`/`marriages`/`parentage`/`rootId`, just now always scoped data
  rather than the whole table. Its new requirement is tolerating
  `rootId: null` gracefully (today it crashes) — see **Empty trees**.
- `app/photos/[id]/route.js` needs the serving query to include `treeId`
  now that `photos.personId`/`marriageId` alone don't uniquely resolve a
  row across trees.
- Every existing `*.test.js` under `src/db/` that seeds `people`/
  `marriages`/`parentage` directly needs a `treeId` (and a `trees` row to
  satisfy the foreign key) added to its fixtures.

## Out of scope

- Everything in [accounts-and-trees](../accounts-and-trees/spec.md) about
  auth: login, sign-up, Google OAuth, sessions, guest accounts. Today
  there is exactly one hardcoded `CURRENT_ACCOUNT_ID` and no sign-in UI at
  all.
- Sharing a tree between accounts, and the `owner`/`editor`/`viewer`
  roles — moot while there's only one account.
- Remembering which tree was last open (a cookie, a session, etc.) — `/`
  always resolves to the most-recently-*created* tree, which is only the
  same thing as "most recently visited" by coincidence.
- Merging two trees, moving/copying a person between trees, or any
  cross-tree search.
- Permission checks beyond "does this tree belong to
  `CURRENT_ACCOUNT_ID`" — matches the rest of the app until real auth
  lands.
- Mobile app.
