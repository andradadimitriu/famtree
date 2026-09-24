// Reads the SQLite tables back into the normalized
// people/marriages/parentage shape familyGraph.js's buildFamilyTree
// expects — the same shape familyData.js used to export directly.
// See specs/persistence/spec.md.

import { isNotNull } from 'drizzle-orm'
import { db } from './client.js'
import { people, marriages, parentage, photos } from './schema.js'

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
    peopleDetails: getPeopleDetails(peopleRows),
  }
}

// Flat, id-keyed bio/photo data — kept separate from the nested tree
// `buildFamilyTree` produces, since that tree isn't deduped by person id
// and is only ever built once client-side. See specs/person-details/spec.md.
function getPeopleDetails(peopleRows) {
  const photoRows = db.select().from(photos).where(isNotNull(photos.personId)).all()

  const photosByPerson = {}
  photoRows.forEach((photo) => {
    ;(photosByPerson[photo.personId] ??= []).push({
      id: photo.id,
      url: `/photos/${photo.id}`,
      caption: photo.caption ?? undefined,
    })
  })

  return Object.fromEntries(
    peopleRows.map((p) => [
      p.id,
      {
        name: p.name,
        born: p.born ?? undefined,
        bio: p.bio ?? '',
        photos: photosByPerson[p.id] ?? [],
      },
    ]),
  )
}
