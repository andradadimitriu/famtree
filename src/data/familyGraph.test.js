// Covers findDisconnectedGroups — splitting everyone/everything
// `buildFamilyTree` doesn't reach from the root into real "islands"
// (disconnected from the root, but with relationships of their own —
// get their own small tree) vs. fully isolated people (no relationship
// worth a tree — grouped into one flat row at the end). Driven by
// uncovered *marriages*, not just uncovered *people* — a person can
// already appear in one tree via a collapsed ancestor stack (their own
// parent's, or a sibling's) while a different marriage of theirs is
// still never shown anywhere; a person reached as a plain spouse, by
// contrast, has their other marriages walked out too (see
// `buildPerson`'s comment in familyGraph.js) so that case alone no
// longer produces an island. See specs/unlink-from/spec.md. Pure
// functions, no DB needed. Run with `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFamilyTree, findDisconnectedGroups } from './familyGraph.js'

function person(id, name = id) {
  return [id, { name, born: undefined }]
}

// Every id `buildFamilyTree(extraRootId)` actually renders, for asserting
// an island's full membership is covered by its assigned root(s).
function idsCoveredBy(people, marriages, parentage, extraRootId) {
  const ids = new Set()
  const walk = (node) => {
    ids.add(node.id)
    ;(node.marriages ?? []).forEach((m) => {
      if (m.spouse) walk(m.spouse)
      ;(m.children ?? m._children ?? []).forEach(walk)
    })
    ;(node.parents ?? node._parents ?? []).forEach(walk)
  }
  walk(buildFamilyTree(people, marriages, parentage, extraRootId))
  return ids
}

// Every marriage id shown by building a tree from `extraRootId`,
// including ones only visible via a collapsed ancestor stack.
function marriagesCoveredBy(people, marriages, parentage, extraRootId) {
  const ids = new Set()
  const walk = (node) => {
    ;(node.marriages ?? []).forEach((m) => {
      if (m.id) ids.add(m.id)
      if (m.spouse) walk(m.spouse)
      ;(m.children ?? m._children ?? []).forEach(walk)
    })
    const parents = node.parents ?? node._parents
    if (parents) {
      if (parents.marriageId) ids.add(parents.marriageId)
      parents.forEach(walk)
    }
  }
  walk(buildFamilyTree(people, marriages, parentage, extraRootId))
  return ids
}

test('no disconnected people: nothing extra needed', () => {
  const people = Object.fromEntries([person('root'), person('spouse')])
  const marriages = [{ id: 'm1', spouses: ['root', 'spouse'] }]
  const result = findDisconnectedGroups(people, marriages, [], 'root')
  assert.deepEqual(result, { islandRoots: [], isolated: [] })
})

test('a single isolated person goes in the flat row, not their own tree', () => {
  const people = Object.fromEntries([person('root'), person('lone')])
  const result = findDisconnectedGroups(people, [], [], 'root')
  assert.deepEqual(result, { islandRoots: [], isolated: ['lone'] })
})

test('someone whose only marriage is an empty Unknown placeholder is also isolated', () => {
  const people = Object.fromEntries([person('root'), person('solo')])
  const marriages = [{ id: 'solo-unknown', spouses: ['solo'] }] // no children
  const result = findDisconnectedGroups(people, marriages, [], 'root')
  assert.deepEqual(result, { islandRoots: [], isolated: ['solo'] })
})

test('a whole island (couple + child) is covered by one island root', () => {
  const people = Object.fromEntries([person('root'), person('a'), person('b'), person('c')])
  const marriages = [{ id: 'm1', spouses: ['a', 'b'] }]
  const parentage = [{ marriageId: 'm1', childId: 'c' }]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(isolated, [])
  assert.equal(islandRoots.length, 1)
  const covered = idsCoveredBy(people, marriages, parentage, islandRoots[0])
  assert.deepEqual([...covered].sort(), ['a', 'b', 'c'])
})

test('two people who only share a spouse (not otherwise connected) need two island roots', () => {
  // x married to shared (child: kidX); y married to shared (child: kidY).
  // Neither x nor y connects to the other except via `shared`, and a
  // spouse's own marriages are deliberately never walked back out (see
  // buildPerson's comment) — so one tree from x's side can't also cover y.
  const people = Object.fromEntries([
    person('root'),
    person('x'),
    person('y'),
    person('shared'),
    person('kidX'),
    person('kidY'),
  ])
  const marriages = [
    { id: 'x-shared', spouses: ['x', 'shared'] },
    { id: 'y-shared', spouses: ['y', 'shared'] },
  ]
  const parentage = [
    { marriageId: 'x-shared', childId: 'kidX' },
    { marriageId: 'y-shared', childId: 'kidY' },
  ]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(isolated, [])
  assert.equal(islandRoots.length, 2)

  const allCovered = new Set()
  islandRoots.forEach((rootId) => {
    for (const id of idsCoveredBy(people, marriages, parentage, rootId)) allCovered.add(id)
  })
  assert.deepEqual([...allCovered].sort(), ['kidX', 'kidY', 'shared', 'x', 'y'])
})

test('a marriage with a child roots at the child, not the parent', () => {
  // Rooting at the child reaches the marriage via its (cheap, collapsed)
  // ancestor stack; rooting at the parent would instead fully re-expand
  // every *other* marriage that parent has too.
  const people = Object.fromEntries([person('root'), person('parent'), person('child')])
  const marriages = [{ id: 'm1', spouses: ['parent'] }]
  const parentage = [{ marriageId: 'm1', childId: 'child' }]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(islandRoots, ['child'])
  assert.deepEqual(isolated, [])
  const covered = idsCoveredBy(people, marriages, parentage, islandRoots[0])
  assert.deepEqual([...covered].sort(), ['child', 'parent'])
})

test('islands and isolated people are both found when both are present', () => {
  const people = Object.fromEntries([
    person('root'),
    person('a'),
    person('b'),
    person('c'),
    person('lone1'),
    person('lone2'),
  ])
  const marriages = [{ id: 'm1', spouses: ['a', 'b'] }]
  const parentage = [{ marriageId: 'm1', childId: 'c' }]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.equal(islandRoots.length, 1)
  assert.deepEqual(isolated.sort(), ['lone1', 'lone2'])
})

test('a person with two separate relationships gets both shown, not just whichever is found first', () => {
  // This is the exact shape of a real bug: `shared` is married to both
  // `spouseA` (with child `kidA`) and `spouseB` (with child `kidB`) —
  // two entirely separate marriages. A person-coverage check would mark
  // `shared` "done" the first time they're seen (e.g. as spouseA's
  // spouse) and never notice the second marriage needs showing too.
  const people = Object.fromEntries([
    person('root'),
    person('shared'),
    person('spouseA'),
    person('kidA'),
    person('spouseB'),
    person('kidB'),
  ])
  const marriages = [
    { id: 'shared-a', spouses: ['shared', 'spouseA'] },
    { id: 'shared-b', spouses: ['shared', 'spouseB'] },
  ]
  const parentage = [
    { marriageId: 'shared-a', childId: 'kidA' },
    { marriageId: 'shared-b', childId: 'kidB' },
  ]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(isolated, [])

  const allMarriagesCovered = new Set()
  islandRoots.forEach((rootId) => {
    for (const id of marriagesCoveredBy(people, marriages, parentage, rootId)) allMarriagesCovered.add(id)
  })
  assert.deepEqual([...allMarriagesCovered].sort(), ['shared-a', 'shared-b'])
})

test('a childless Unknown-placeholder marriage whose spouse already appears elsewhere needs no new tree', () => {
  // `spouse` is already fully covered by the main tree (married to
  // `root`, with a real child). `spouse` separately has an empty,
  // childless "Unknown" marriage of their own (e.g. a leftover
  // placeholder) — rooting a fresh tree at `spouse` to show that empty
  // marriage would just redundantly re-expand their already-visible
  // branch (`root-spouse` and `realChild`) a second time for no new
  // information, so it should be skipped rather than producing a
  // duplicate island.
  const people = Object.fromEntries([person('root'), person('spouse'), person('realChild')])
  const marriages = [
    { id: 'root-spouse', spouses: ['root', 'spouse'] },
    { id: 'spouse-unknown', spouses: ['spouse'] }, // childless
  ]
  const parentage = [{ marriageId: 'root-spouse', childId: 'realChild' }]

  const result = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(result, { islandRoots: [], isolated: [] })
})

test('unlinking one of two parents (keeping the other via a new incomplete marriage) still shows the kept parent, inline rather than as an island', () => {
  // Reproduces the real scenario: `child` was linked to both `momA` and
  // `dad`, then unlinked from `momA` — leaving a brand-new incomplete
  // marriage `dad-unknown` that only `child` points to. `dad` is only
  // otherwise reachable as `momB`'s spouse — but a person reached as a
  // spouse now has their *other* marriages walked out too (see
  // `buildPerson`'s comment), so `dad-unknown` gets built right there as
  // part of the main tree, with no island needed at all.
  const people = Object.fromEntries([
    person('root'),
    person('momB'),
    person('dad'),
    person('siblingViaMomB'),
    person('child'),
  ])
  const marriages = [
    { id: 'root-momB', spouses: ['root', 'momB'] },
    { id: 'momB-dad', spouses: ['momB', 'dad'] },
    { id: 'dad-unknown', spouses: ['dad'] },
  ]
  const parentage = [
    { marriageId: 'momB-dad', childId: 'siblingViaMomB' },
    { marriageId: 'dad-unknown', childId: 'child' },
  ]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(islandRoots, [])
  assert.deepEqual(isolated, [])

  const coveredByMainTree = idsCoveredBy(people, marriages, parentage, 'root')
  assert.ok(coveredByMainTree.has('child'), '`child` (via the new dad-unknown marriage) must be shown')
  assert.ok(coveredByMainTree.has('dad'))
})

test("a spouse's second marriage (e.g. a child from before their current marriage) renders inline, not as an island", () => {
  // The exact shape of the real bug this was written for: David is
  // married to Margaret (reachable from root only as her spouse) and
  // separately has an earlier, incomplete marriage that produced Andrada.
  // Andrada must show up as part of the main tree, not as a disconnected
  // island below it.
  const people = Object.fromEntries([
    person('root'),
    person('margaret'),
    person('david'),
    person('andrada'),
  ])
  const marriages = [
    { id: 'root-margaret', spouses: ['root', 'margaret'] },
    { id: 'margaret-david', spouses: ['margaret', 'david'] },
    { id: 'david-unknown', spouses: ['david'] },
  ]
  const parentage = [{ marriageId: 'david-unknown', childId: 'andrada' }]

  const { islandRoots, isolated } = findDisconnectedGroups(people, marriages, parentage, 'root')
  assert.deepEqual(islandRoots, [])
  assert.deepEqual(isolated, [])

  const tree = buildFamilyTree(people, marriages, parentage, 'root')
  const davidNode = tree.marriages[0].spouse.marriages[0].spouse
  assert.equal(davidNode.id, 'david')
  assert.equal(davidNode.marriages[0].children[0].id, 'andrada')
})
