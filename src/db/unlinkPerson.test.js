// Covers unlinkPerson's parents/children/spouse branches, especially the
// shared "detach child from parent, keep the other one if present"
// primitive and its reuse of the "never duplicate a marriage" rule — see
// specs/unlink-from/spec.md. Against a disposable temp SQLite database —
// never the real dev data/famtree.db. Run with `npm test`.

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
const { unlinkPerson } = await import('./actions.js')

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

function insertPerson(id, name = id) {
  db.insert(people).values({ id, name }).run()
}

function insertMarriage(id, spouse1Id, spouse2Id = null) {
  db.insert(marriages).values({ id, spouse1Id, spouse2Id }).run()
}

function insertParentage(marriageId, childId) {
  db.insert(parentage).values({ marriageId, childId }).run()
}

function getMarriage(id) {
  return db.select().from(marriages).where(eq(marriages.id, id)).get()
}

function allMarriages() {
  return db.select().from(marriages).all()
}

function getParentageFor(childId) {
  return db.select().from(parentage).where(eq(parentage.childId, childId)).get()
}

function unlink(personId, fields) {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => formData.append(key, v))
    } else {
      formData.set(key, value)
    }
  })
  return unlinkPerson(personId, null, formData)
}

// --- Parents --------------------------------------------------------------

test('parents, child has one known parent: removes the parentage row entirely', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'kid')

  const result = await unlink('kid', { category: 'parents', removeParentId: 'mom' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid'), undefined)
  assert.ok(getMarriage('mom-unknown'), 'the marriage itself is left alone')
})

test('parents, child has two parents, both removed: removes the parentage row entirely', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')

  const result = await unlink('kid', { category: 'parents', removeParentId: ['mom', 'dad'] })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid'), undefined)
})

test('parents, child has two parents, one removed: keeps the other via a reused/new incomplete marriage', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')

  const result = await unlink('kid', { category: 'parents', removeParentId: 'dad' })

  assert.equal(result.error, null)
  assert.ok(getMarriage('mom-dad'), 'the original marriage is untouched')
  const newMarriageId = getParentageFor('kid').marriageId
  assert.notEqual(newMarriageId, 'mom-dad')
  assert.deepEqual(getMarriage(newMarriageId), { id: newMarriageId, spouse1Id: 'mom', spouse2Id: null })
})

test('parents, removing one parent reuses an existing incomplete marriage of the kept parent', async () => {
  insertPerson('kid')
  insertPerson('otherKid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'otherKid')

  const result = await unlink('kid', { category: 'parents', removeParentId: 'dad' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid').marriageId, 'mom-unknown')
  assert.equal(allMarriages().length, 2, 'no duplicate incomplete marriage was created')
})

test('parents, unlinking a parent not actually on record is rejected', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('stranger')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'kid')

  const result = await unlink('kid', { category: 'parents', removeParentId: 'stranger' })

  assert.ok(result.error)
  assert.ok(getParentageFor('kid'), 'nothing was changed')
})

test('parents, person with no recorded parents is rejected', async () => {
  insertPerson('kid')

  const result = await unlink('kid', { category: 'parents', removeParentId: 'kid' })

  assert.equal(result.error, 'kid has no recorded parents.')
})

// --- Children -------------------------------------------------------------

test('children, child has only this parent: removes the parentage row entirely', async () => {
  insertPerson('parent')
  insertPerson('kid')
  insertMarriage('parent-unknown', 'parent')
  insertParentage('parent-unknown', 'kid')

  const result = await unlink('parent', { category: 'children', childId: 'kid' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid'), undefined)
})

test('children, child has two parents: keeps the other parent via a reused/new incomplete marriage', async () => {
  insertPerson('mom')
  insertPerson('dad')
  insertPerson('kid')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')

  const result = await unlink('dad', { category: 'children', childId: 'kid' })

  assert.equal(result.error, null)
  assert.ok(getMarriage('mom-dad'), 'the original marriage is untouched')
  const newMarriageId = getParentageFor('kid').marriageId
  assert.notEqual(newMarriageId, 'mom-dad')
  assert.deepEqual(getMarriage(newMarriageId), { id: newMarriageId, spouse1Id: 'mom', spouse2Id: null })
})

test('children, a child not actually linked to this parent is rejected', async () => {
  insertPerson('parent')
  insertPerson('unrelatedKid')

  const result = await unlink('parent', { category: 'children', childId: 'unrelatedKid' })

  assert.equal(result.error, 'Choose a valid child.')
})

// --- Spouse -----------------------------------------------------------

test('spouse, no children on the marriage: deletes the marriage outright', async () => {
  insertPerson('a')
  insertPerson('b')
  insertMarriage('a-b', 'a', 'b')

  const result = await unlink('a', { category: 'spouse', spouseId: 'b' })

  assert.equal(result.error, null)
  assert.equal(getMarriage('a-b'), undefined)
})

test('spouse, marriage has children, the unlinking person keeps them', async () => {
  insertPerson('a')
  insertPerson('b')
  insertPerson('kid1')
  insertPerson('kid2')
  insertMarriage('a-b', 'a', 'b')
  insertParentage('a-b', 'kid1')
  insertParentage('a-b', 'kid2')

  const result = await unlink('a', { category: 'spouse', spouseId: 'b', keepParentId: 'a' })

  assert.equal(result.error, null)
  assert.equal(getMarriage('a-b'), undefined)
  const kid1MarriageId = getParentageFor('kid1').marriageId
  const kid2MarriageId = getParentageFor('kid2').marriageId
  assert.equal(kid1MarriageId, kid2MarriageId, 'both children end up on the same new marriage')
  assert.deepEqual(getMarriage(kid1MarriageId), { id: kid1MarriageId, spouse1Id: 'a', spouse2Id: null })
})

test('spouse, marriage has children, the other spouse keeps them', async () => {
  insertPerson('a')
  insertPerson('b')
  insertPerson('kid')
  insertMarriage('a-b', 'a', 'b')
  insertParentage('a-b', 'kid')

  const result = await unlink('a', { category: 'spouse', spouseId: 'b', keepParentId: 'b' })

  assert.equal(result.error, null)
  const newMarriageId = getParentageFor('kid').marriageId
  assert.deepEqual(getMarriage(newMarriageId), { id: newMarriageId, spouse1Id: 'b', spouse2Id: null })
})

test('spouse, marriage has children but no keepParentId given: rejected', async () => {
  insertPerson('a')
  insertPerson('b')
  insertPerson('kid')
  insertMarriage('a-b', 'a', 'b')
  insertParentage('a-b', 'kid')

  const result = await unlink('a', { category: 'spouse', spouseId: 'b' })

  assert.ok(result.error)
  assert.ok(getMarriage('a-b'), 'nothing was changed')
})

test('spouse, an incomplete marriage (Unknown placeholder) is not a valid unlink target', async () => {
  insertPerson('a')
  insertMarriage('a-unknown', 'a')

  const result = await unlink('a', { category: 'spouse', spouseId: '' })

  assert.equal(result.error, 'Choose a valid spouse.')
  assert.ok(getMarriage('a-unknown'), 'nothing was changed')
})

test('spouse unlink cleans up marriage-linked photos', async () => {
  insertPerson('a')
  insertPerson('b')
  insertMarriage('a-b', 'a', 'b')
  db.insert(photos).values({ marriageId: 'a-b', filePath: 'does-not-exist.jpg' }).run()

  const result = await unlink('a', { category: 'spouse', spouseId: 'b' })

  assert.equal(result.error, null)
  assert.equal(db.select().from(photos).all().length, 0)
})

// --- General ------------------------------------------------------------

test('errors on an unknown person', async () => {
  const result = await unlink('nobody', { category: 'spouse', spouseId: 'alsoNobody' })
  assert.equal(result.error, 'Person not found.')
})

test('rejects an unrecognized category', async () => {
  insertPerson('a')
  const result = await unlink('a', { category: 'bogus' })
  assert.equal(result.error, 'Choose what to unlink.')
})

test('returned tree data reflects the post-unlink state', async () => {
  insertPerson('a')
  insertPerson('b')
  insertMarriage('a-b', 'a', 'b')

  const result = await unlink('a', { category: 'spouse', spouseId: 'b' })

  assert.ok(!result.marriages.some((m) => m.id === 'a-b'))
})
