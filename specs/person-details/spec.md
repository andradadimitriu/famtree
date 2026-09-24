# famtree — Spec

## Summary

Every person's name becomes clickable, opening a panel (sliding in from
the left) with a free-text Markdown biography and a photo gallery for that
person — both fully editable from the browser. This is the first
read/write UI in the app; everything before this spec
([persistence](../persistence/spec.md)) only ever read seeded data.

## Why

[persistence](../persistence/spec.md) added a `photos` table and local
file storage but explicitly left "edit UI" and "displaying photos in the
tree" as future work. This is that work: a person is more than a name and
a birth year, and the whole point of moving to a real database was to make
this kind of thing possible.

## Data model

`people` gains one column:

```ts
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  born: integer('born'),
  bio: text('bio'), // Markdown source
})
```

`photos` (from [persistence](../persistence/spec.md)) is unchanged. Only
`personId`-linked photos are surfaced here — `marriageId`-linked photos
stay unused/out of scope.

## Bio is Markdown

The bio field stores raw Markdown, rendered client-side with
`react-markdown` (chosen over `dangerouslySetInnerHTML` + a raw HTML
string specifically because the source is user-supplied — rendering to
React elements means there's no raw-HTML-injection step to sanitize
against).

The panel shows the **rendered** bio by default — read-only, no visible
textarea. A pencil/edit icon swaps that section over to a `<textarea>`
holding the raw Markdown source, inside a form; saving swaps back to the
rendered view. There is no live split-pane preview — you're either reading
the rendered result or editing the raw source, one at a time.

## Photos: gallery and inline insertion

Photos attach to a person two ways, both writing to the same `photos`
table:

1. **Gallery**: a small upload form (file input, optional caption) plus a
   thumbnail grid of everything already uploaded, each with a delete
   control.
2. **Inline in the Markdown**: while the bio is in edit mode, an "insert
   image" icon opens a file picker; the chosen file uploads immediately
   (independent of the bio form's own save), and `![](url)` is spliced
   into the textarea at the cursor.

An image inserted inline is not a separate kind of object — it's an
ordinary `photos` row like any gallery upload, so it also appears in the
gallery grid. There is no reference-tracking between the two: deleting a
photo from the gallery that's also referenced inline in the bio's
Markdown leaves a broken `![]()` link there. Accepted rough edge — the
user can just edit the text. No lightbox/zoom on gallery thumbnails.

## Where this data lives vs. the rendered tree

`FamilyTree.jsx` builds its tree once (per
[collapse-parents](../collapse-parents/spec.md)/[ancestors](../ancestors/spec.md))
into a `useRef` and mutates that frozen object in place for collapse/expand
state. Bio/photos are **not** part of that structure — a person can be
built into more than one separate object across contexts (e.g. as a
spouse's ancestor vs. later as an ordinary tree member;
`familyGraph.js`'s `buildPerson` doesn't dedupe by id), so embedding
editable data there would either go stale in one copy after editing
another, or never update at all since the ref is only built once.

Instead, person detail data is a flat, id-keyed map (`peopleDetails: {
[personId]: { name, born, bio, photos } }`) passed as its own prop,
read directly in render — not funneled through the frozen tree ref. A
write (via Server Action, see below) triggers `revalidatePath('/')`,
which re-runs the page and flows a fresh `peopleDetails` prop straight
into the already-mounted tree component; the collapse-state tree is
untouched by any of this.

Person cards need a stable id to know which person was clicked —
`familyGraph.js`'s `buildPerson` now also sets `id: personId` on every
built node (previously only `name`/`born`).

## Mutations

Three Server Actions (`'use server'`), following Next's documented
pattern for forms + extra arguments via `.bind()`:

- `updatePersonBio(personId, prevState, formData)`
- `uploadPersonPhoto(personId, prevState, formData)` — also returns the
  created photo's `{ id, url, caption }`, since the inline-insert flow
  calls it directly (not through a form) and needs the URL back to splice
  into the textarea.
- `deletePersonPhoto(photoId)`

No authentication/authorization — consistent with
[persistence](../persistence/spec.md)'s accepted scope of a single local
user, no multi-user access.

## Out of scope

- Renaming a person, editing birth year, or any other field besides
  bio/photos.
- Photos attached to a marriage rather than a person.
- A live Markdown preview while editing (edit *or* rendered view, not
  both at once).
- Reference-tracking between inline Markdown image links and gallery
  deletes (see above).
- Any form of auth — matches [persistence](../persistence/spec.md).
