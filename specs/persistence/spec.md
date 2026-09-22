# famtree — Spec

## Summary

Move the family data out of the static `familyData.js` module (per
[people-and-relationships](../people-and-relationships/spec.md)) and into a
real, locally-stored database — SQLite via Drizzle ORM — running behind a
Next.js server instead of the current Vite static build. Also adds storage
for scanned photos/documents, associated with a person or a marriage, kept
as files on local disk and referenced by path from the database.

## Why

- **Editing/persistence.** Today `people`/`marriages`/`parentage` are
  hand-written literals that only change by editing source and redeploying.
  A real database is a prerequisite for any future add/edit UI.
- **Scanned images.** Photos and documents naturally attach to people (and
  marriages — e.g. a wedding photo), and can't be represented as JS literals
  in any useful way. This needs actual file storage plus DB rows tracking
  what belongs to whom.
- **Needs a server.** Vite's build here is a static site with no
  server-side code, so it can't run DB queries at request time. Next.js
  runs both the React frontend and server-side code from one project,
  which is why this spec also moves the app off Vite.
- **Local-first, no account required.** SQLite is a single file; uploaded
  images are plain files on disk. Nothing to sign up for, easy to back up,
  and still swappable for a hosted DB/object storage later without
  redesigning the schema (see **Out of scope**).

## Scope

- Migrate the app from Vite to Next.js (App Router).
- Replace `src/data/familyData.js`'s in-memory `people`/`marriages`/
  `parentage` literals with equivalent tables in a local SQLite database,
  defined and queried via Drizzle ORM.
- Add a `photos` table associating an uploaded image/scan with a person or
  a marriage.
- Store uploaded photo files on local disk, outside of git.
- Seed the new database with today's sample family (the same people
  currently in `familyData.js`), so the app's on-screen output is
  unchanged aside from the new (unused-for-now) photo capability.
- `familyGraph.js`'s tree-building logic is unaffected — it still consumes
  the same normalized shape, just fetched from the DB instead of imported
  from a JS module. See **How existing code reads this**.

## Data model

The three existing collections become three tables with the same shape:

```ts
// Drizzle schema (SQLite)
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  born: integer('born'),
})

export const marriages = sqliteTable('marriages', {
  id: text('id').primaryKey(),
  spouse1Id: text('spouse1_id').notNull().references(() => people.id),
  spouse2Id: text('spouse2_id').references(() => people.id), // null: unknown/unrecorded spouse
})

export const parentage = sqliteTable('parentage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  marriageId: text('marriage_id').notNull().references(() => marriages.id),
  childId: text('child_id').notNull().references(() => people.id),
})
```

New table for scanned images:

```ts
export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personId: text('person_id').references(() => people.id),
  marriageId: text('marriage_id').references(() => marriages.id),
  filePath: text('file_path').notNull(), // relative path under the local uploads dir
  caption: text('caption'),
  takenYear: integer('taken_year'),
})
```

- Exactly one of `personId`/`marriageId` is set per photo — a photo of a
  person, or a photo of a couple/marriage (e.g. a wedding portrait).
  Enforced at the application layer, not a DB constraint — SQLite has no
  native "exactly one of" check without a trigger, not worth it here.
- A person or marriage can have any number of photos.
- `rootId` stays a plain constant for now (not a table) — there's still
  only one tree being rendered. Revisit if the app ever needs more than
  one root/tree.

## File storage

- Uploaded files are written to a local directory, e.g. `data/uploads/`,
  outside of git (gitignored alongside the SQLite file itself).
- `photos.filePath` stores the path relative to that directory; the app
  resolves it to an absolute path (writes) or a served URL (reads) at one
  boundary only — nothing else in the app deals with absolute paths, so
  swapping to hosted object storage later (see **Out of scope**) touches
  just that boundary, not the schema or the rest of the app.
- Images are served to the browser through a Next.js route (e.g.
  `app/photos/[id]/route.js`) rather than from `public/` — `public/` is
  bundled as static assets at build time and isn't a fit for user-uploaded,
  growing, gitignored data.

## Framework migration (Vite → Next.js)

- `vite.config.js`, `index.html`, and `src/main.jsx` are removed; the
  App Router owns the entry point and build config instead (`next.config.js`,
  `app/layout.js`).
- `src/App.jsx` becomes `app/page.js`: a Server Component that queries the
  DB via Drizzle and renders `<FamilyTree>` — still a Client Component,
  since it owns D3/DOM manipulation and local toggle state — passing the
  fetched `people`/`marriages`/`parentage`/`rootId` down as props instead
  of `FamilyTree` importing them itself.
- `src/components/FamilyTree.jsx` is otherwise unchanged, apart from
  taking that data as props rather than importing `familyData.js` directly.
- `src/App.css`, `src/index.css`, `src/components/FamilyTree.css` carry
  over as-is — Next.js supports plain CSS imports the same way Vite does.
- `package.json` scripts (`dev`/`build`/`preview`) switch from
  `vite`/`vite build`/`vite preview` to `next dev`/`next build`/`next start`.

## How existing code reads this

- `familyGraph.js`'s `buildFamilyTree(people, marriages, parentage, rootId)`
  is unchanged — it already takes these three collections as plain
  arguments, agnostic to where they came from.
- `FamilyTree.jsx`, `PersonCard`, `AncestorStack`, etc. are unaffected by
  this spec — no tree-building or D3 layout code changes. A later spec can
  add photo display (e.g. a thumbnail on `PersonCard`) once this storage
  layer exists.

## Seeding and migrations

- `drizzle-kit` generates the SQL migration that creates the `people`/
  `marriages`/`parentage`/`photos` tables; migration files are committed
  to the repo (per Drizzle convention) so schema history is tracked, even
  though the SQLite data file itself is gitignored.
- A one-time seed script inserts today's sample family (currently
  hand-written in `familyData.js`) into the new tables. `familyData.js` is
  deleted once the seed is verified to produce the same on-screen tree.

## Out of scope

- Any UI for adding/editing people, marriages, or uploading photos — this
  spec only moves existing sample data into the DB and adds the
  schema/plumbing for photos; the app still renders the same read-only
  tree as today. Edit UI is future work.
- Multi-user access, auth, or remote/network access — SQLite + local disk
  assumes one person running the app locally. Revisit (likely migrating to
  Postgres + hosted object storage, e.g. Supabase) if/when this needs to
  run as a shared remote app.
- Displaying photos in the tree UI itself (`PersonCard` thumbnails, a photo
  viewer, etc.) — this spec only adds the storage layer.
- Mobile app / React Native — unrelated to this spec; this data layer
  doesn't change based on what client eventually consumes it.
