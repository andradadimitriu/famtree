# famtree — Spec

## Summary

Add user accounts and multi-tree support. Today the app has exactly one
family tree, with no notion of a user — [persistence](../persistence/spec.md)
explicitly left "multi-user access, auth" out of scope. This spec reverses
that: every person/marriage/photo belongs to a specific **tree**, every tree
has an **owner** and can be shared with **collaborators**, and every visitor
— even one who never signs up — is a **user** (a silent guest account) so
the rest of the app can always assume "there is a current user with some
trees" rather than special-casing the logged-out case.

Login is available via email+password and via Google OAuth. The header
gains a tree switcher (left) and an auth control (right):

```
┌──────────────────────────────────────────────────────────────┐
│ [My Trees ▾] [+ New tree]              Family Tree  [Log in] │
└──────────────────────────────────────────────────────────────┘
```

## Scope

- Add `users`, `accounts`/`sessions` (OAuth + credentials, Auth.js shape),
  `trees`, and `tree_members` tables.
- Add `people.treeId`, scoping a tree's data (marriages/parentage/photos
  stay scoped transitively through the people they reference — see
  **Data model**).
- Email+password and Google sign-in, via Auth.js (`next-auth`).
- Anonymous guest accounts, created silently on first visit, upgradeable
  to a real account on sign-up/login without losing their trees.
- Tree sharing: an owner can invite another user (by email) as an editor
  or viewer.
- Header UI: tree switcher + "new tree" (left), auth control (right).
- Minimal "create tree" flow: name + root person's name — just enough that
  a new tree isn't empty and unrenderable. (See **Out of scope** — this is
  not the general add-person UI.)
- Permission checks on every existing mutation (`updatePersonBio`,
  `uploadPersonPhoto`, `deletePersonPhoto`) and on the photo-serving route.

## Data model

```ts
// New
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // crypto.randomUUID() — see "ID conventions"
  email: text('email').unique(), // null for a guest that never signed up
  passwordHash: text('password_hash'), // null if credentials login unused
  name: text('name'),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// `accounts` (OAuth provider links) and `sessions`/`verification_tokens`
// follow whatever shape @auth/drizzle-adapter expects — not hand-designed
// here, just wired up per its docs against the `users` table above.

export const trees = sqliteTable('trees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  rootPersonId: text('root_person_id').references(() => people.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// One row per (tree, user) the user has access to — including the owner
// (role 'owner'), so "can this user see/edit this tree" is always a single
// tree_members lookup, never a separate ownerId check.
export const treeMembers = sqliteTable('tree_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  treeId: text('tree_id').notNull().references(() => trees.id),
  // Null + inviteEmail set: a pending invite, not yet claimed by a user.
  userId: text('user_id').references(() => users.id),
  inviteEmail: text('invite_email'),
  role: text('role').notNull(), // 'owner' | 'editor' | 'viewer'
})

// Changed — gains treeId:
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  treeId: text('tree_id').notNull().references(() => trees.id),
  name: text('name').notNull(),
  born: integer('born'),
  bio: text('bio'),
})
```

- `marriages`, `parentage`, and `photos` are **unchanged** — a marriage's
  spouses, a parentage row's parents/child, and a photo's person/marriage
  all reference `people` rows, which already carry `treeId`. Enforced at
  the application layer (same style as the existing "exactly one of
  personId/marriageId" rule on `photos`): never link two people from
  different trees.
- `rootId` stops being the plain constant it was in
  [persistence](../persistence/spec.md) — `trees.rootPersonId` replaces it,
  one per tree. It's nullable in the schema only because a tree and its
  root person can't be inserted in the same statement; application code
  creates both in one transaction, so by the time anything reads a tree,
  `rootPersonId` is always set.
- **ID conventions.** Existing `people`/`marriages` ids are hand-picked,
  readable slugs (`eleanor-whitfield`) because they're seeded/edited by a
  person. `users` and `trees` ids are never hand-written, so they're plain
  `crypto.randomUUID()` values.

## Auth

- [Auth.js](https://authjs.dev) (`next-auth`) with `@auth/drizzle-adapter`
  against the `users`/`accounts`/`sessions` tables above.
- **Credentials provider** (email + password): password hashed with
  `bcryptjs` before storing in `users.passwordHash`; verified on login.
- **Google provider**: standard OAuth sign-in; on first Google sign-in for
  an email with no existing `users` row, a new one is created
  (`isGuest: false`, `passwordHash: null`).
- A `getCurrentUser()` helper is the one thing the rest of the app calls —
  it returns an Auth.js session user if one exists, otherwise the guest
  user described below. Nothing downstream of it needs to know which case
  it got; it always has a `userId`.

## Guest accounts

- On any request with no Auth.js session and no guest cookie, the server
  creates a `users` row (`isGuest: true`, `email: null`) and sets a signed,
  HTTP-only cookie identifying it. `getCurrentUser()` reads that cookie on
  every later request from the same browser.
- A brand-new guest with zero trees is routed straight into the "create
  your first tree" flow (see **Routing**) — never shown an empty state
  with nothing to click.
- **Claiming.** When a guest signs up (credentials) or signs in with Google
  while their guest cookie is still present, a claim step runs right after
  Auth.js resolves the real `users` row (new or pre-existing, e.g. they'd
  already signed up on another device):
  - Every `trees.ownerId` and `tree_members.userId` equal to the guest's id
    is reassigned to the real user's id.
  - Any resulting duplicate `tree_members` row (the real account already
    had its own membership on a tree the guest also somehow had — only
    possible via a pending invite claimed below) is collapsed to one row,
    keeping the higher-privilege role.
  - The guest's now-empty `users` row is deleted and the guest cookie is
    cleared.
  - This is the same "attach pending access to a real user" mechanism a
    collaborator invite claim uses (see **Sharing**) — both are "a
    `userId` shows up later for rows that only had a provisional identifier
    before."

## Sharing

- Roles: `owner` (full control, including inviting/removing members and
  deleting the tree), `editor` (can edit people/marriages/photos — today
  that means bios and photos; more once add/edit-person UI exists),
  `viewer` (read-only).
- An owner invites by email from the tree's member list:
  - Email matches an existing `users` row → a `tree_members` row is
    inserted immediately with that `userId`.
  - No match → a `tree_members` row is inserted with `inviteEmail` set and
    `userId` null. When that email later signs up or logs in, the claim
    step (above) fills in `userId` and clears `inviteEmail`.
- No email is sent for an invite in this spec — see **Out of scope**. The
  invited person only sees the shared tree appear in their tree switcher
  once they're logged in with the matching email.

## Routing

- `app/trees/[treeId]/page.js` — today's `app/page.js` content, scoped to
  one tree. Requires a `tree_members` row for `(treeId, currentUser.id)`;
  no row → redirected to `/` rather than shown the tree.
- `app/page.js` becomes a resolver, not a page: look up the current user
  (creating a guest if needed) and their trees, then redirect to the
  most-recently-visited tree, or into "create your first tree" if they
  have none.
- `/login` — email+password form plus "Sign in with Google", used for both
  login and sign-up (credentials sign-up is "log in with an email that
  doesn't exist yet, plus a chosen password").

## Header UI

- **Left — tree switcher.** Dropdown of the current user's trees (via
  `tree_members`), each showing its name; selecting one navigates to
  `/trees/[treeId]`. A "+ New tree" button opens a small form (tree name,
  root person's name, optional birth year) that creates the tree, its root
  person, and an `owner` `tree_members` row in one transaction, then
  navigates there.
- **Right — auth control.** Logged in as a real (non-guest) user: shows
  their name and a "Sign out" action. Guest: shows "Log in" — not "Sign
  up", since a guest already has a working account; logging in upgrades
  it in place per **Guest accounts**.

## How existing code reads this

- `familyGraph.js` is unaffected — `getFamilyData` (now
  `getTreeData(treeId)`) still hands it the same normalized
  `people`/`marriages`/`parentage`/`rootId` shape, just filtered to one
  tree's rows instead of the whole table.
- `updatePersonBio`, `uploadPersonPhoto`, `deletePersonPhoto`
  (`src/db/actions.js`) each gain a permission check at the top: resolve
  the target person's `treeId`, look up `getCurrentUser()`'s role via
  `tree_members`, and reject (no DB write) unless that role is `owner` or
  `editor`.
- `app/photos/[id]/route.js` gains the same check before streaming a file
  — join `photos.personId → people.treeId → tree_members` for the current
  user; any role (including `viewer`) may read, no row means 404.

## Out of scope

- Sending invite emails or any other notification — an invite is only
  discoverable by logging in with the matching email.
- Password reset and email verification flows.
- Per-person permissions within a tree — a role applies to the whole tree.
- Real-time/live collaborative editing — ordinary request/response, same
  as today; two editors can still overwrite each other's bio edit, exactly
  as a single local user already could.
- Account deletion, and removing a tree's last owner without a
  replacement.
- Rate limiting / brute-force protection on the credentials login route.
- General add/edit-person UI — still future work per
  [persistence](../persistence/spec.md#out-of-scope); "create tree" above
  only adds the one minimal root-person field needed to make a new tree
  non-empty.
- Mobile app.
