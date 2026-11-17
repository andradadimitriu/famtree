# famtree — Spec

## Summary

Every person gets one designated **profile photo**, picked either by
uploading a new image or choosing one of the photos already in their
gallery ([person-details](../person-details/spec.md)). It displays in
three places at three sizes: a large (128px) block in `PersonPanel`,
between the name heading and the About section; a small avatar next to
the name in that same heading; and a small avatar badge on the
person's card in the tree. It's edited from the same pencil-icon
identity form that already edits name/born/died
([edit-identity](../edit-identity/spec.md)) — the large block between
name and About is a read-only display, not itself interactive.

## Why

- A person today is a name and two dates on the tree — no visual
  identity, even though [person-details](../person-details/spec.md)
  already lets a photo gallery be uploaded per person.
- Nothing in that gallery is distinguished as "the" photo for this
  person — there's no way to say "this one, specifically, is who shows
  on the card."
- The identity form (name/born/died) is already the one place a
  person's core display attributes are edited together; this adds a
  fourth.

## Data model

`people` gains one column, a nullable reference into the existing
`photos` table:

```ts
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  born: text('born'),
  died: text('died'),
  bio: text('bio'),
  profilePhotoId: integer('profile_photo_id').references(() => photos.id),
})
```

No new table — a profile photo is just an existing `photos` row
(uploaded through the same gallery flow from
[person-details](../person-details/spec.md)) flagged as "the" one. It
must already be linked to this person (`photos.personId ===
people.id`) — enforced in `setProfilePhoto` below, not at the schema
level (SQLite has no column-level cross-row check).

Deleting the photo currently set as a person's profile photo clears the
reference rather than leaving a dangling id — `deletePersonPhoto` checks
for this (see Mutations).

## UI

Three display spots, all falling back to an initial-letter placeholder
when no profile photo is set, all reading the same
`details.profilePhotoUrl`/`person.profilePhotoUrl`:

- **Between name and About** (the part of the original ask): a 128px
  rounded-square block, `.person-panel__profile-photo`, sitting right
  after `PersonPanel`'s header and before the "About" section. Purely
  a display — no click handler, no edit affordance of its own.
- **Panel heading**: a small (28px) circular avatar to the left of
  `{name} (b. …, d. …)`, in both the read-only heading and the identity
  edit form's heading.
- **Tree card**: a small (22px) circular avatar badge in the top-left
  corner of `PersonCard` in `FamilyTree.jsx`, photo or initial-letter
  placeholder — left, not top-center, so it never collides with the
  parent-row/ancestor toggle badges, which both sit top-center. A long
  centered name's leftmost glyphs can still graze it — accepted rough
  edge, same spirit as `unionSide`'s own doc comment in that file.
  `UnknownPersonCard` (unrecorded-spouse placeholder) is unaffected —
  there's no person record behind it to have a photo.

**Editing** lives entirely inside the existing identity edit form
(`PersonPanel`'s pencil icon next to the heading, see
[edit-identity](../edit-identity/spec.md)) as a new field, above Name —
none of the three display spots above are themselves interactive:

- A thumbnail of the current profile photo (or the placeholder), with
  controls beside it:
  - **Upload new** — a file input; picking a file uploads it
    immediately via `uploadPersonPhoto` (same as the gallery) and sets
    it as the profile photo in one step.
  - **Choose existing** — only shown when `details.photos.length > 0`;
    a small grid of the person's existing gallery thumbnails, clicking
    one sets it as the profile photo.
  - **Remove** — clears the profile photo back to the placeholder.
    Only shown when one is already set.

All three act immediately (their own `setProfilePhoto`/
`uploadPersonPhoto` call), the same way gallery upload/delete already
work independently of the Save/Cancel buttons on name/born/died — Cancel
on the identity form discards in-progress name/born/died edits but does
**not** revert a profile-photo change made while the form was open.

## Propagation

Same shape as [edit-identity](../edit-identity/spec.md)'s propagation
problem, for the same reason: a profile photo needs to show on the
*tree card*, and `FamilyTree.jsx`'s D3 hierarchy (`rootDataRef.current`)
is built once from the initial `people`/`marriages`/`parentage` props
and never rebuilt — a later `peopleDetails` refresh never reaches it.

- `familyGraph.js`'s `buildPerson` adds `profilePhotoUrl` to the node it
  already builds (`{ id, name, born }` → `{ id, name, born,
  profilePhotoUrl }`), so it flows into every occurrence of this person
  the tree builds (main hierarchy, a spouse's own ancestor stack,
  etc.) — same caveat `edit-identity` already notes: not deduped by
  person id, so a later direct DB read wouldn't reach every copy
  either.
- `queries.js`'s `getTreeData()` — today only returns `{ name, born }`
  per person — grows a third field so `buildPerson` has something to
  read: a resolved `profilePhotoUrl` (`/photos/{id}`) when
  `profilePhotoId` is set, else `undefined`.
- `patchPersonInTree` (already walks the same
  `marriages[].spouse`/`children`/`parents` shape for
  `edit-identity`'s name/born patch) takes `profilePhotoUrl` as a third
  patchable field.
- `PersonPanel` calls `onPersonUpdated(personId, { profilePhotoUrl })`
  immediately after a successful `setProfilePhoto`/upload-and-set,
  independent of the identity form's own Save — `FamilyTree` patches
  the live tree and bumps `version` right away, same as a gallery
  upload doesn't wait for the identity form to be submitted.

`peopleDetails` (read fresh every render, per
[person-details](../person-details/spec.md)) already gets the new
`profilePhotoId`/resolved URL for free from `revalidatePath('/')` —
only the frozen tree needs the explicit patch.

## Mutations

One new Server Action, alongside `updatePersonIdentity`/
`uploadPersonPhoto` in `src/db/actions.js`:

- `setProfilePhoto(personId, photoId)` — `photoId: null` clears it.
  Validates the photo exists and `photos.personId === personId`
  (rejects a marriage photo or another person's photo) before writing
  `people.profilePhotoId`. Returns `{ error, profilePhotoUrl }` so the
  caller can patch the tree without a second read.

`uploadPersonPhoto` is unchanged — the "upload new" control calls it
exactly as the gallery does, then calls `setProfilePhoto` with the
returned photo's id as a second step.

`deletePersonPhoto` gains one check: if the deleted photo's id matches
that person's current `profilePhotoId`, clear it (`UPDATE people SET
profile_photo_id = NULL ...`) in the same action, so the avatar never
points at a row that no longer exists.

## Out of scope

- Cropping/resizing on upload — the profile photo renders at whatever
  aspect ratio it was uploaded, clipped (to a circle or a rounded
  square, depending on the spot) via CSS (`object-fit: cover`), not
  re-encoded.
- A profile photo for a marriage (couple photo) — `photos.marriageId`
  stays unused for this feature, same as
  [person-details](../person-details/spec.md) left it out of scope.
- Any default/stock avatar image — the fallback is an initial-letter
  circle, not a placeholder image.
- Permission checks — out of scope until
  [accounts-and-trees](../accounts-and-trees/spec.md) lands, same as
  every other mutation here.
