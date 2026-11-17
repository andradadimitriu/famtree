// Turns the normalized `people`/`marriages`/`parentage` store into the
// nested shape FamilyTree.jsx renders:
//   { name, born, marriages: [{ spouse, children }], parents }
// `parents` is only attached to the root and to spouses — anyone reached
// by walking `children` already has their parents shown as the real row
// above them in the tree, so attaching it there too would draw the same
// couple twice. See specs/ancestors/spec.md.
// A spouse's own `marriages` is included too (minus the marriage that
// connects them to whoever they're a spouse *of* here), so a spouse's
// other marriage — and any children on it — renders inline instead of as
// a disconnected island. See `buildPerson`'s comment below.

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
  const parents = marriage.spouses.map((parentId) =>
    buildPerson(parentId, people, indices, {
      includeMarriages: false,
      includeAncestors: true,
    }),
  )
  // Tagged on the array itself (harmless extra property — every existing
  // consumer only ever indexes/iterates it) so `collectMarriageIds` can
  // tell this marriage was shown here, even though it's shown via the
  // collapsed ancestor stack rather than a `marriages[]` entry.
  parents.marriageId = marriageId
  return parents
}

// `visitedMarriages` is a Set threaded through the whole recursion (one
// per top-level `buildFamilyTree`/`buildPerson` call, shared by reference
// from there down), marking every marriage already built into the tree so
// it's never built a second time. Without it, building a spouse's own
// marriages back out would immediately recurse into the very marriage we
// reached them through, and so on forever (David Hayes -> spouse Margaret
// -> her marriage back to David -> ...). With it, that one marriage is
// filtered out (already in the set by the time the spouse is built) while
// any *other* marriage the spouse has — e.g. a second marriage producing
// a half-sibling, previously rendered as its own disconnected island, see
// specs/unlink-from/spec.md — still gets built and shown inline, same as
// any other marriage. Only the root and people reached by walking
// `children` downward get `includeAncestors: true`'s collapsed ancestor
// stack instead of this expansion — that stack intentionally stays
// simple/collapsed even now, see specs/ancestors/spec.md.
function buildPerson(
  personId,
  people,
  indices,
  { includeMarriages, includeAncestors, visitedMarriages = new Set() },
) {
  const person = people[personId]
  // `id` is what lets a clicked card look itself up in the separate,
  // flat `peopleDetails` map — see specs/person-details/spec.md.
  // `profilePhotoUrl` is the avatar shown on the card — see
  // specs/profile-photo/spec.md.
  const node = { id: personId, name: person.name, born: person.born, profilePhotoUrl: person.profilePhotoUrl }

  const personMarriages = includeMarriages
    ? (indices.marriagesByPerson[personId] ?? []).filter((m) => !visitedMarriages.has(m.id))
    : undefined
  if (personMarriages?.length) {
    node.marriages = personMarriages.map((marriage) => {
      visitedMarriages.add(marriage.id)
      const spouseId = marriage.spouses.find((id) => id !== personId)
      const childIds = indices.childrenByMarriage[marriage.id]
      // Not read by any rendering code (FamilyTree.jsx keys/positions
      // marriages by array index, not id) — only by `collectMarriageIds`,
      // to tell whether this marriage has been shown anywhere yet.
      const entry = { id: marriage.id }
      if (spouseId) {
        entry.spouse = buildPerson(spouseId, people, indices, {
          includeMarriages: true,
          includeAncestors: true,
          visitedMarriages,
        })
      }
      if (childIds?.length) {
        entry.children = childIds.map((childId) =>
          buildPerson(childId, people, indices, {
            includeMarriages: true,
            includeAncestors: false,
            visitedMarriages,
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

// Walks the exact shape `buildFamilyTree` produces (marriages/children/
// parents, post-`collapseAncestors` so ancestors may already be under
// `_parents`), collecting every person id it actually touches.
function collectIds(node, ids) {
  ids.add(node.id)
  ;(node.marriages ?? []).forEach((marriage) => {
    if (marriage.spouse) collectIds(marriage.spouse, ids)
    ;(marriage.children ?? marriage._children ?? []).forEach((child) => collectIds(child, ids))
  })
  ;(node.parents ?? node._parents ?? []).forEach((parent) => collectIds(parent, ids))
}

// Same walk, collecting marriage ids instead — a marriage counts as
// "shown" whether it appears as a `marriages[]` entry (tagged with its
// own `id`, see `buildPerson`) or as a collapsed ancestor pair (tagged
// via `.marriageId`, see `buildAncestors`). Used to find relationships
// `buildFamilyTree(rootId)` doesn't reach, which `collectIds`/a plain
// per-person reachability check can miss: a person can be reached via a
// *collapsed ancestor stack* (their own parent's, or a sibling's) while a
// different marriage of theirs is still never walked out from that
// position — `buildAncestors` always builds its pair with
// `includeMarriages: false`, deliberately, so it stays a simple pair
// rather than expanding (see specs/ancestors/spec.md) — so being "shown
// once" via an ancestor stack doesn't mean every relationship is. (A
// person reached as a plain spouse, by contrast, now does get their other
// marriages walked out too — see `buildPerson`'s comment.)
function collectMarriageIds(node, ids) {
  ;(node.marriages ?? []).forEach((marriage) => {
    if (marriage.id) ids.add(marriage.id)
    if (marriage.spouse) collectMarriageIds(marriage.spouse, ids)
    ;(marriage.children ?? marriage._children ?? []).forEach((child) => collectMarriageIds(child, ids))
  })
  const parents = node.parents ?? node._parents
  if (parents) {
    if (parents.marriageId) ids.add(parents.marriageId)
    parents.forEach((parent) => collectMarriageIds(parent, ids))
  }
}

// Splits everyone/everything `buildFamilyTree(rootId)` doesn't reach into
// two kinds:
//
// - `islandRoots`: root ids for additional small trees — a marriage with
//   at least one child, disconnected from the root (e.g. after unlinking
//   the one link that tied it in — see specs/unlink-from/spec.md). Each
//   is meant to be built into its own tree via `buildFamilyTree`, the
//   same way the main root is, so the relationship is actually shown
//   rather than hidden in a flat row.
// - `isolated`: ids of people with no relationship worth its own tree —
//   nobody else is reached by building a tree from them (a freshly
//   created person always falls in here, see
//   specs/add-remove-people/spec.md; so does someone whose only marriage
//   is an empty, childless "Unknown" placeholder). Meant to be rendered
//   together as a single flat row, not as N separate one-card trees.
//
// Driven by uncovered *marriages*, not uncovered *people* — a person can
// already appear in some tree via a collapsed ancestor stack while a
// different marriage of theirs is still never walked out from that
// position (see `collectMarriageIds`'s comment), so "has this person
// appeared anywhere" isn't enough to know every relationship has been
// shown. For
// a marriage with children, the root is one of its children — reaching
// the marriage via that child's (cheap, collapsed) ancestor stack rather
// than via the spouse's full `marriages[]` expansion, which would also
// drag in and duplicate every *other* marriage that spouse has. A
// childless marriage (nothing to anchor an ancestor stack on) roots at
// one of its own spouses instead.
export function findDisconnectedGroups(people, marriages, parentage, rootId) {
  const coveredPeople = new Set()
  const coveredMarriages = new Set()
  const absorb = (tree) => {
    collectIds(tree, coveredPeople)
    collectMarriageIds(tree, coveredMarriages)
  }
  absorb(buildFamilyTree(people, marriages, parentage, rootId))

  const childIds = new Set(parentage.map((p) => p.childId))
  const remainingMarriageIds = new Set(marriages.map((m) => m.id).filter((id) => !coveredMarriages.has(id)))

  const islandRoots = []
  const isolated = []
  while (remainingMarriageIds.size > 0) {
    const marriageId = remainingMarriageIds.values().next().value
    const marriage = marriages.find((m) => m.id === marriageId)
    const children = parentage.filter((p) => p.marriageId === marriageId).map((p) => p.childId)

    // A childless marriage has no child to anchor a cheap ancestor-stack
    // view with — the only way to show it at all is rooting a tree at one
    // of its own spouses, which (being root) re-expands *every* marriage
    // that spouse has, not just this one. If that spouse already appears
    // somewhere (e.g. Diane Whitfield, already shown as Robert's spouse,
    // who also happens to have an unrelated empty "Unknown" placeholder
    // marriage), that would just redundantly rebuild their whole already-
    // visible branch for no new information — so a childless marriage
    // whose spouse(s) are already covered is marked covered and skipped
    // instead of getting its own (purely duplicate) tree.
    if (children.length === 0 && marriage.spouses.some((id) => coveredPeople.has(id))) {
      coveredMarriages.add(marriageId)
      remainingMarriageIds.delete(marriageId)
      continue
    }

    // Prefer a child (cheap, non-duplicating); otherwise a spouse with no
    // recorded parent of their own, the natural "eldest" starting point.
    const nextRoot = children[0] ?? marriage.spouses.find((id) => !childIds.has(id)) ?? marriage.spouses[0]

    const tree = buildFamilyTree(people, marriages, parentage, nextRoot)
    const groupIds = new Set()
    collectIds(tree, groupIds)
    if (groupIds.size > 1) {
      islandRoots.push(nextRoot)
    } else {
      isolated.push(nextRoot)
    }

    absorb(tree)
    for (const id of coveredMarriages) remainingMarriageIds.delete(id)
  }

  // Anyone with no marriage at all (so the loop above never touched
  // them) and still not shown by the main tree either.
  Object.keys(people).forEach((id) => {
    if (!coveredPeople.has(id)) isolated.push(id)
  })

  return { islandRoots, isolated }
}
