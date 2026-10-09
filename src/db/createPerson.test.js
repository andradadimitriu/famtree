// Covers createPerson — inserting a standalone person with no
// relationships. See specs/add-remove-people/spec.md. Against a
// disposable temp SQLite database — never the real dev data/famtree.db.
// Run with `npm test`.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'famtree-test-'))
process.env.FAMTREE_DB_PATH = path.join(tmpDir, 'test.db')

// See stub-next-cache.loader.js — must be registered before anything below
// transitively imports actions.js, which imports `next/cache`.
register('./test-support/stub-next-cache.loader.js', import.meta.url)

const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
const { db } = await import('./client.js')
const { people, marriages, parentage, photos } = await import('./schema.js')
const { createPerson } = await import('./actions.js')

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

before(() => {
  migrate(db, { migrationsFolder })
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  db.delete(photos).run()
  db.delete(parentage).run()
  db.delete(marriages).run()
  db.delete(people).run()
})

function create(fields) {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value))
  return createPerson(null, formData)
}

test('creates a standalone person with no relationships', async () => {
  const result = await create({ name: 'New Person', born: '1990', died: '' })

  assert.equal(result.error, null)
  const rows = db.select().from(people).all()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'New Person')
  assert.equal(rows[0].born, '1990')
  assert.equal(rows[0].died, null)
  assert.equal(db.select().from(marriages).all().length, 0)
  assert.equal(db.select().from(parentage).all().length, 0)
})

test('name is required', async () => {
  const result = await create({ name: '  ', born: '', died: '' })

  assert.equal(result.error, 'Name is required')
  assert.equal(db.select().from(people).all().length, 0)
})

test('rejects a malformed born/died date', async () => {
  const result = await create({ name: 'Someone', born: 'not-a-date', died: '' })

  assert.ok(result.error)
  assert.equal(db.select().from(people).all().length, 0)
})

test('born and died are both optional', async () => {
  const result = await create({ name: 'No Dates', born: '', died: '' })

  assert.equal(result.error, null)
  const [row] = db.select().from(people).all()
  assert.equal(row.born, null)
  assert.equal(row.died, null)
})

test('returned tree data includes the newly created person', async () => {
  const result = await create({ name: 'Fresh Face', born: '', died: '' })

  const [row] = db.select().from(people).all()
  assert.ok(row.id in result.people)
  assert.equal(result.people[row.id].name, 'Fresh Face')
})
