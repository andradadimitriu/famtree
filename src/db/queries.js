// Reads the SQLite tables back into the normalized
// people/marriages/parentage shape familyGraph.js's buildFamilyTree
// expects — the same shape familyData.js used to export directly.
// See specs/persistence/spec.md.

import { db } from './client.js'
import { people, marriages, parentage } from './schema.js'

// Only one tree is rendered today, so this stays a plain constant rather
// than a table — see specs/persistence/spec.md.
export const rootId = 'eleanor-whitfield'

export function getFamilyData() {
  const peopleRows = db.select().from(people).all()
  const marriageRows = db.select().from(marriages).all()
  const parentageRows = db.select().from(parentage).all()

  return {
    people: Object.fromEntries(
      peopleRows.map((p) => [p.id, { name: p.name, born: p.born ?? undefined }]),
    ),
    marriages: marriageRows.map((m) => ({
      id: m.id,
      spouses: [m.spouse1Id, m.spouse2Id].filter(Boolean),
    })),
    parentage: parentageRows.map((p) => ({
      marriageId: p.marriageId,
      childId: p.childId,
    })),
    rootId,
  }
}
