// Drizzle schema for the SQLite store. Mirrors the normalized
// people/marriages/parentage shape from specs/people-and-relationships,
// plus a `photos` table for scanned images. See specs/persistence/spec.md.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  born: integer('born'),
  bio: text('bio'), // Markdown source — see specs/person-details/spec.md
})

export const marriages = sqliteTable('marriages', {
  id: text('id').primaryKey(),
  spouse1Id: text('spouse1_id')
    .notNull()
    .references(() => people.id),
  // Null when the other spouse is unknown/unrecorded.
  spouse2Id: text('spouse2_id').references(() => people.id),
})

export const parentage = sqliteTable('parentage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  marriageId: text('marriage_id')
    .notNull()
    .references(() => marriages.id),
  childId: text('child_id')
    .notNull()
    .references(() => people.id),
})

// Exactly one of personId/marriageId is set per photo (a photo of a
// person, or of a couple) — enforced in application code, not here.
export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personId: text('person_id').references(() => people.id),
  marriageId: text('marriage_id').references(() => marriages.id),
  filePath: text('file_path').notNull(),
  caption: text('caption'),
  takenYear: integer('taken_year'),
})
