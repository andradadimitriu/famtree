// Covers linkPerson's child-of/parent-of/spouse-of branches, especially
// the "never duplicate a marriage" rule (reuse an existing/matching
// marriage instead of creating or gap-filling a new one) — see
// specs/link-relationships/spec.md. Against a disposable temp SQLite
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
const { linkPerson } = await import('./actions.js')

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

function getMarriage(id) {
  return db.select().from(marriages).where(eq(marriages.id, id)).get()
}

function allMarriages() {
  return db.select().from(marriages).all()
}

function getParentageFor(childId) {
  return db.select().from(parentage).where(eq(parentage.childId, childId)).get()
}

function link(personId, fields) {
  const formData = new FormData()
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value))
  return linkPerson(personId, null, formData)
}

// --- Child of -------------------------------------------------------------

test('child-of, no existing parents, both parents given: creates a new marriage', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')

  const result = await link('kid', { relationship: 'child-of', parent1Id: 'mom', parent2Id: 'dad' })

  assert.equal(result.error, null)
  const row = getParentageFor('kid')
  assert.ok(row)
  const marriage = getMarriage(row.marriageId)
  assert.deepEqual([marriage.spouse1Id, marriage.spouse2Id].sort(), ['dad', 'mom'])
})

test('child-of, no existing parents, both given: reuses an existing marriage between them', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertPerson('sibling')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'sibling')

  const result = await link('kid', { relationship: 'child-of', parent1Id: 'mom', parent2Id: 'dad' })

  assert.equal(result.error, null)
  assert.deepEqual(getParentageFor('kid'), { id: getParentageFor('kid').id, marriageId: 'mom-dad', childId: 'kid' })
  assert.equal(allMarriages().length, 1, 'no duplicate marriage was created')
})

test('child-of, no existing parents, parent 2 left unknown: creates an incomplete marriage', async () => {
  insertPerson('kid')
  insertPerson('mom')

  const result = await link('kid', { relationship: 'child-of', parent1Id: 'mom' })

  assert.equal(result.error, null)
  const row = getParentageFor('kid')
  const marriage = getMarriage(row.marriageId)
  assert.deepEqual(marriage, { id: marriage.id, spouse1Id: 'mom', spouse2Id: null })
})

test('child-of, parent 2 left unknown: reuses an existing incomplete marriage of parent 1', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('sibling')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'sibling')

  const result = await link('kid', { relationship: 'child-of', parent1Id: 'mom' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid').marriageId, 'mom-unknown')
  assert.equal(allMarriages().length, 1, 'no duplicate incomplete marriage was created')
})

test('child-of, one known parent, no other children on that marriage: fills the gap', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'kid')

  const result = await link('kid', { relationship: 'child-of', otherParentId: 'dad' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('mom-unknown'), { id: 'mom-unknown', spouse1Id: 'mom', spouse2Id: 'dad' })
  assert.equal(getParentageFor('kid').marriageId, 'mom-unknown')
})

test('child-of, one known parent, marriage already has another child: creates a new marriage instead of filling the gap', async () => {
  insertPerson('kid')
  insertPerson('sibling')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'sibling')
  insertParentage('mom-unknown', 'kid')

  const result = await link('kid', { relationship: 'child-of', otherParentId: 'dad' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('mom-unknown'), { id: 'mom-unknown', spouse1Id: 'mom', spouse2Id: null })
  assert.equal(getParentageFor('sibling').marriageId, 'mom-unknown', 'sibling keeps its original parent')
  const kidMarriageId = getParentageFor('kid').marriageId
  assert.notEqual(kidMarriageId, 'mom-unknown')
  assert.deepEqual([getMarriage(kidMarriageId).spouse1Id, getMarriage(kidMarriageId).spouse2Id].sort(), [
    'dad',
    'mom',
  ])
})

test('child-of, one known parent, chosen other parent already married to the known parent: reassigns to that existing marriage', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-unknown', 'mom')
  insertParentage('mom-unknown', 'kid')
  insertMarriage('mom-dad', 'mom', 'dad')

  const result = await link('kid', { relationship: 'child-of', otherParentId: 'dad' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid').marriageId, 'mom-dad')
  assert.deepEqual(getMarriage('mom-unknown'), { id: 'mom-unknown', spouse1Id: 'mom', spouse2Id: null })
  assert.equal(allMarriages().length, 2, 'no new marriage was created')
})

test('child-of is rejected once two parents are already recorded', async () => {
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertPerson('other')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')

  const result = await link('kid', { relationship: 'child-of', otherParentId: 'other' })

  assert.equal(result.error, 'kid already has two parents.')
})

// --- Parent of --------------------------------------------------------------

test('parent-of, child has no parents: creates an incomplete marriage for the new parent', async () => {
  insertPerson('parent')
  insertPerson('kid')

  const result = await link('parent', { relationship: 'parent-of', childId: 'kid' })

  assert.equal(result.error, null)
  const marriage = getMarriage(getParentageFor('kid').marriageId)
  assert.deepEqual(marriage, { id: marriage.id, spouse1Id: 'parent', spouse2Id: null })
})

test('parent-of, child has no parents: reuses the parent\'s existing incomplete marriage', async () => {
  insertPerson('parent')
  insertPerson('kid')
  insertPerson('otherKid')
  insertMarriage('parent-unknown', 'parent')
  insertParentage('parent-unknown', 'otherKid')

  const result = await link('parent', { relationship: 'parent-of', childId: 'kid' })

  assert.equal(result.error, null)
  assert.equal(getParentageFor('kid').marriageId, 'parent-unknown')
  assert.equal(allMarriages().length, 1)
})

test('parent-of, child has one known parent, no other children: fills the gap', async () => {
  insertPerson('newParent')
  insertPerson('kid')
  insertPerson('knownParent')
  insertMarriage('known-unknown', 'knownParent')
  insertParentage('known-unknown', 'kid')

  const result = await link('newParent', { relationship: 'parent-of', childId: 'kid' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('known-unknown'), {
    id: 'known-unknown',
    spouse1Id: 'knownParent',
    spouse2Id: 'newParent',
  })
})

test('parent-of, child has one known parent with another child already attached: creates a new marriage', async () => {
  insertPerson('newParent')
  insertPerson('kid')
  insertPerson('sibling')
  insertPerson('knownParent')
  insertMarriage('known-unknown', 'knownParent')
  insertParentage('known-unknown', 'sibling')
  insertParentage('known-unknown', 'kid')

  const result = await link('newParent', { relationship: 'parent-of', childId: 'kid' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('known-unknown'), {
    id: 'known-unknown',
    spouse1Id: 'knownParent',
    spouse2Id: null,
  })
  assert.notEqual(getParentageFor('kid').marriageId, 'known-unknown')
})

test('parent-of is rejected for a child who already has two parents', async () => {
  insertPerson('newParent')
  insertPerson('kid')
  insertPerson('mom')
  insertPerson('dad')
  insertMarriage('mom-dad', 'mom', 'dad')
  insertParentage('mom-dad', 'kid')

  const result = await link('newParent', { relationship: 'parent-of', childId: 'kid' })

  assert.equal(result.error, 'That person already has two parents.')
})

// --- Spouse of ----------------------------------------------------------

test('spouse-of, no existing marriage: creates a new one', async () => {
  insertPerson('a')
  insertPerson('b')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'b' })

  assert.equal(result.error, null)
  const marriage = allMarriages().find((m) => m.spouse1Id === 'a' || m.spouse2Id === 'a')
  assert.deepEqual([marriage.spouse1Id, marriage.spouse2Id].sort(), ['a', 'b'])
})

test('spouse-of, existing incomplete marriage with no children: fills the gap', async () => {
  insertPerson('a')
  insertPerson('b')
  insertMarriage('a-unknown', 'a')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'b' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('a-unknown'), { id: 'a-unknown', spouse1Id: 'a', spouse2Id: 'b' })
  assert.equal(allMarriages().length, 1)
})

test('spouse-of, existing incomplete marriage already has children: creates a separate new marriage', async () => {
  insertPerson('a')
  insertPerson('b')
  insertPerson('kid')
  insertMarriage('a-unknown', 'a')
  insertParentage('a-unknown', 'kid')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'b' })

  assert.equal(result.error, null)
  assert.deepEqual(getMarriage('a-unknown'), { id: 'a-unknown', spouse1Id: 'a', spouse2Id: null })
  assert.equal(allMarriages().length, 2)
})

test('spouse-of is rejected when already married to that person', async () => {
  insertPerson('a')
  insertPerson('b')
  insertMarriage('a-b', 'a', 'b')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'b' })

  assert.equal(result.error, 'a is already married to that person.')
})

test('spouse-of is rejected when linking to a nonexistent person', async () => {
  insertPerson('a')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'nobody' })

  assert.equal(result.error, 'Choose a valid spouse.')
})

test('errors on an unknown person', async () => {
  const result = await link('nobody', { relationship: 'spouse-of', spouseId: 'alsoNobody' })
  assert.equal(result.error, 'Person not found.')
})

test('returned tree data reflects the post-link state', async () => {
  insertPerson('a')
  insertPerson('b')

  const result = await link('a', { relationship: 'spouse-of', spouseId: 'b' })

  assert.ok('a' in result.people)
  assert.ok('b' in result.people)
  const marriage = result.marriages.find((m) => m.spouses.includes('a') && m.spouses.includes('b'))
  assert.ok(marriage)
})
