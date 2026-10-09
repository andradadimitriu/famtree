// A person's parent state, from the normalized people/marriages/parentage
// shape queries.js's getTreeData() returns (`marriages: [{ id, spouses
// }]`, `parentage: [{ marriageId, childId }]`). Shared by PersonPanel (to
// decide which "Link to" dropdowns to show and how to filter them) and
// linkPerson (to validate server-side) — one implementation of the rule,
// not two that could drift apart. See specs/link-relationships/spec.md.
export function getParentState(personId, marriages, parentage) {
  const row = parentage.find((p) => p.childId === personId)
  if (!row) return { state: 'none' }

  const marriage = marriages.find((m) => m.id === row.marriageId)
  if (marriage.spouses.length < 2) {
    return { state: 'one', marriageId: marriage.id, knownParentId: marriage.spouses[0] }
  }
  return { state: 'two' }
}

// An existing marriage whose spouses are exactly `{idA, idB}`, in either
// order, or undefined. The "never duplicate a marriage" rule every
// linkPerson branch applies before creating or filling one.
export function findMarriage(marriages, idA, idB) {
  return marriages.find(
    (m) =>
      (m.spouses[0] === idA && m.spouses[1] === idB) ||
      (m.spouses[0] === idB && m.spouses[1] === idA),
  )
}

// An existing marriage recording `personId` as its only known spouse
// (spouses.length === 1) — the schema's one nullable slot is always
// spouse2Id, so this is always where an "Unknown" placeholder lives.
export function findIncompleteMarriage(marriages, personId) {
  return marriages.find((m) => m.spouses.length === 1 && m.spouses[0] === personId)
}

// Whether any parentage row other than `excludingChildId`'s own already
// points at `marriageId` — decides whether filling a marriage's gap would
// silently reassign an existing sibling's second parent.
export function marriageHasChildren(marriageId, parentage, excludingChildId) {
  return parentage.some((p) => p.marriageId === marriageId && p.childId !== excludingChildId)
}
