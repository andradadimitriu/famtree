// Covers deletePerson's unlink-not-cascade semantics (see
// specs/add-remove-people/spec.md) against a disposable temp SQLite
// database — never the real dev data/famtree.db. Run with `npm test`.

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
const { eq } = await import('drizzle-orm')
const { db } = await import('./client.js')
const { people, marriages, parentage, photos } = await import('./schema.js')
const { deletePerson } = await import('./actions.js')
const { rootId } = await import('./queries.js')

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

before(() => {
  migrate(db, { migrationsFolder })
})

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// Each test starts from an empty DB and inserts exactly the rows it needs,
// rather than sharing a seeded fixture — keeps every case self-contained.
beforeEach(() => {
  db.delete(photos).run()
  db.delete(parentage).run()
  db.delete(marriages).run()
  db.delete(people).run()
})

function insertPerson(id, name = id) {
  db.insert(people).values({ id, name }).run()
}

function insertMarriage(id, spouse1Id, spouse2Id = null) {
  db.insert(marriages).values({ id, spouse1Id, spouse2Id }).run()
}

function insertParentage(marriageId, childId) {
  db.insert(parentage).values({ marriageId, childId }).run()
}

function insertPhoto({ personId = null, marriageId = null }) {
  db.insert(photos).values({ personId, marriageId, filePath: 'does-not-exist.jpg' }).run()
}

function getPerson(id) {
  return db.select().from(people).where(eq(people.id, id)).get()
}

function getMarriage(id) {
  return db.select().from(marriages).where(eq(marriages.id, id)).get()
}

test('blocks deleting the root person', async () => {
  const result = await deletePerson(rootId)
  assert.deepEqual(result, { error: 'Cannot delete the root person.' })
})

test('errors on an unknown person', async () => {
  const result = await deletePerson('nobody')
  assert.equal(result.error, 'Person not found.')
})

test('deletes a standalone person with no relationships', async () => {
  insertPerson('lone')

  const result = await deletePerson('lone')

  assert.equal(result.error, null)
  assert.equal(getPerson('lone'), undefined)
  assert.ok(!('lone' in result.people))
})

test('deleting the sole recorded spouse unlinks (not deletes) their children and drops the marriage', async () => {
  insertPerson('solo-parent')
  insertPerson('kid')
  insertMarriage('solo-marriage', 'solo-parent')
  insertParentage('solo-marriage', 'kid')
  insertPhoto({ personId: 'solo-parent' })
  insertPhoto({ marriageId: 'solo-marriage' })

  const result = await deletePerson('solo-parent')

  assert.equal(result.error, null)
  assert.equal(getPerson('solo-parent'), undefined)
  assert.ok(getPerson('kid'), 'the child should still exist')
  assert.equal(getMarriage('solo-marriage'), undefined)
  assert.equal(
    db.select().from(parentage).where(eq(parentage.childId, 'kid')).get(),
    undefined,
    'the child loses its link to this parent, but is not deleted',
  )
  assert.equal(db.select().from(photos).all().length, 0, 'own and marriage photos are cleaned up')
})

test('deleting one spouse of a two-spouse marriage promotes the other into spouse1Id', async () => {
  insertPerson('spouse-a')
  insertPerson('spouse-b')
  insertPerson('kid')
  insertMarriage('ab', 'spouse-a', 'spouse-b')
  insertParentage('ab', 'kid')

  const result = await deletePerson('spouse-a')

  assert.equal(result.error, null)
  assert.ok(getPerson('spouse-b'), 'the remaining spouse is not deleted')
  assert.deepEqual(getMarriage('ab'), { id: 'ab', spouse1Id: 'spouse-b', spouse2Id: null })
  assert.ok(
    db.select().from(parentage).where(eq(parentage.marriageId, 'ab')).get(),
    'the child stays linked to the surviving parent',
  )
})

test('deleting spouse2 of a two-spouse marriage just clears that slot', async () => {
  insertPerson('spouse-a')
  insertPerson('spouse-b')
  insertMarriage('ab', 'spouse-a', 'spouse-b')

  const result = await deletePerson('spouse-b')

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('ab'), { id: 'ab', spouse1Id: 'spouse-a', spouse2Id: null })
})

test('deleting a person unlinks them from their own recorded parents', async () => {
  insertPerson('parent')
  insertPerson('child')
  insertMarriage('p', 'parent')
  insertParentage('p', 'child')

  const result = await deletePerson('child')

  assert.equal(result.error, null)
  assert.ok(getPerson('parent'), 'the parent is untouched')
  assert.ok(getMarriage('p'), 'the parent marriage survives with no children')
  assert.equal(db.select().from(parentage).where(eq(parentage.childId, 'child')).get(), undefined)
})

test('returned tree data reflects the post-delete state', async () => {
  insertPerson('spouse-a')
  insertPerson('spouse-b')
  insertMarriage('ab', 'spouse-a', 'spouse-b')

  const result = await deletePerson('spouse-b')

  assert.ok('spouse-a' in result.people)
  assert.ok(!('spouse-b' in result.people))
  assert.deepEqual(
    result.marriages.find((m) => m.id === 'ab'),
    { id: 'ab', spouses: ['spouse-a'] },
  )
})
