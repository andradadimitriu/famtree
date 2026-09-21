// Turns the normalized `people`/`marriages`/`parentage` store into the
// nested shape FamilyTree.jsx renders:
//   { name, born, marriages: [{ spouse, children }], parents }
// `parents` is only attached to the root and to spouses — anyone reached
// by walking `children` already has their parents shown as the real row
// above them in the tree, so attaching it there too would draw the same
// couple twice. See specs/ancestors/spec.md.

function buildIndices(marriages, parentage) {
  const marriagesByPerson = {}
  const marriagesById = {}
  marriages.forEach((marriage) => {
    marriagesById[marriage.id] = marriage
    marriage.spouses.forEach((id) => {
      ;(marriagesByPerson[id] ??= []).push(marriage)
    })
  })

  const childrenByMarriage = {}
  const parentMarriageByChild = {}
  parentage.forEach(({ marriageId, childId }) => {
    ;(childrenByMarriage[marriageId] ??= []).push(childId)
    parentMarriageByChild[childId] = marriageId
  })

  return { marriagesByPerson, marriagesById, childrenByMarriage, parentMarriageByChild }
}

function buildAncestors(personId, people, indices) {
  const marriageId = indices.parentMarriageByChild[personId]
  if (!marriageId) return undefined
  const marriage = indices.marriagesById[marriageId]
  return marriage.spouses.map((parentId) =>
    buildPerson(parentId, people, indices, {
      includeMarriages: false,
      includeAncestors: true,
    }),
  )
}

// `includeMarriages` must be false for spouses and ancestors — a spouse's
// own `marriages` includes the very marriage we reached them through, so
// building it back out would recurse into their partner again, and so on
// forever (David Hayes -> spouse Margaret -> her marriage back to David ->
// ...). Only the root and people reached by walking `children` downward
// get their own `marriages` built. A parent's own remarriage (which would
// produce half-siblings-in-law) is representable in the data but out of
// scope for rendering, same reasoning.
function buildPerson(personId, people, indices, { includeMarriages, includeAncestors }) {
  const person = people[personId]
  const node = { name: person.name, born: person.born }

  const personMarriages = includeMarriages ? indices.marriagesByPerson[personId] : undefined
  if (personMarriages?.length) {
    node.marriages = personMarriages.map((marriage) => {
      const spouseId = marriage.spouses.find((id) => id !== personId)
      const childIds = indices.childrenByMarriage[marriage.id]
      const entry = {}
      if (spouseId) {
        entry.spouse = buildPerson(spouseId, people, indices, {
          includeMarriages: false,
          includeAncestors: true,
        })
      }
      if (childIds?.length) {
        entry.children = childIds.map((childId) =>
          buildPerson(childId, people, indices, {
            includeMarriages: true,
            includeAncestors: false,
          }),
        )
      }
      return entry
    })
  }

  if (includeAncestors) {
    const parents = buildAncestors(personId, people, indices)
    if (parents) node.parents = parents
  }

  return node
}

// Mutates `node`, moving every `parents` it can reach into `_parents`, so
// ancestor stacks start collapsed — same `children`/`_children` convention
// `FamilyTree.jsx`'s `collapseBelowDepth` uses for marriages.
function collapseAncestors(node) {
  if (node.parents) {
    node._parents = node.parents
    node.parents = undefined
  }
  node._parents?.forEach(collapseAncestors)
  node.marriages?.forEach((marriage) => {
    if (marriage.spouse) collapseAncestors(marriage.spouse)
    marriage.children?.forEach(collapseAncestors)
  })
}

export function buildFamilyTree(people, marriages, parentage, rootId) {
  const indices = buildIndices(marriages, parentage)
  const root = buildPerson(rootId, people, indices, {
    includeMarriages: true,
    includeAncestors: true,
  })
  collapseAncestors(root)
  return root
}
