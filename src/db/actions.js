'use server'

// Mutations for the person detail panel. No auth — this assumes a single
// local user, per specs/persistence/spec.md. See specs/person-details/spec.md.

import { eq, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from './client.js'
import { people, marriages, parentage, photos } from './schema.js'
import { savePhotoFile, deletePhotoFile } from '../storage/photos.js'
import { parsePartialDate } from '../lib/partialDate.js'
import { getParentState, findMarriage, findIncompleteMarriage, marriageHasChildren } from '../lib/parentState.js'
import { getTreeData, rootId } from './queries.js'

export async function updatePersonBio(personId, _prevState, formData) {
  const bio = formData.get('bio')?.toString() ?? ''
  db.update(people).set({ bio }).where(eq(people.id, personId)).run()
  revalidatePath('/')
  return { error: null }
}

// Name/born are also baked into FamilyTree.jsx's client-side hierarchy
// data, which this write alone doesn't reach — the caller patches that
// tree directly once this resolves. See specs/edit-identity/spec.md.
export async function updatePersonIdentity(personId, _prevState, formData) {
  const name = formData.get('name')?.toString().trim() ?? ''
  if (!name) {
    return { error: 'Name is required' }
  }

  const bornResult = parsePartialDate(formData.get('born'))
  if (bornResult.error) return { error: bornResult.error }

  const diedResult = parsePartialDate(formData.get('died'))
  if (diedResult.error) return { error: diedResult.error }

  db.update(people)
    .set({ name, born: bornResult.value, died: diedResult.value })
    .where(eq(people.id, personId))
    .run()
  revalidatePath('/')
  return { error: null }
}

// Accepts one or more `file` entries (the gallery form's input allows
// multi-select; the inline insert-image flow in the Markdown editor
// always sends exactly one). Returns the created photos, not just an
// error — the inline flow calls this directly (not through a <form>) and
// needs the URL back to splice into the editor. See
// specs/person-details/spec.md.
export async function uploadPersonPhoto(personId, _prevState, formData) {
  const files = formData.getAll('file').filter((file) => file instanceof File && file.size > 0)
  const caption = formData.get('caption')?.toString() || null

  if (files.length === 0) {
    return { error: 'No file provided', photos: [] }
  }

  const uploaded = []
  let error = null
  for (const file of files) {
    try {
      const filePath = await savePhotoFile(personId, file)
      const [photo] = db.insert(photos).values({ personId, filePath, caption }).returning().all()
      uploaded.push({ id: photo.id, url: `/photos/${photo.id}`, caption })
    } catch (err) {
      error =
        uploaded.length > 0
          ? `Uploaded ${uploaded.length} of ${files.length} — ${err.message}`
          : err.message
      break
    }
  }

  revalidatePath('/')
  return { error, photos: uploaded }
}

export async function deletePersonPhoto(photoId) {
  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get()
  if (!photo) return

  db.delete(photos).where(eq(photos.id, photoId)).run()
  await deletePhotoFile(photo.filePath)
  revalidatePath('/')
}

// Inserts a standalone person with no marriages/parentage — the family
// tree renders anyone not reachable from the root as a loose card below
// everyone else (see `findUnlinkedPeople`), so a brand-new person shows up
// immediately without needing to be linked to anyone first. See
// specs/add-remove-people/spec.md.
export async function createPerson(_prevState, formData) {
  const name = formData.get('name')?.toString().trim() ?? ''
  if (!name) {
    return { error: 'Name is required' }
  }

  const bornResult = parsePartialDate(formData.get('born'))
  if (bornResult.error) return { error: bornResult.error }

  const diedResult = parsePartialDate(formData.get('died'))
  if (diedResult.error) return { error: diedResult.error }

  const id = crypto.randomUUID()
  db.insert(people).values({ id, name, born: bornResult.value, died: diedResult.value }).run()

  revalidatePath('/')
  return { error: null, ...getTreeData() }
}

// Deletes a person, unlinking (not cascading into) anyone they were
// related to — their spouse, children, and parents all remain in the
// tree, only the connections to this person are removed. See
// specs/add-remove-people/spec.md.
export async function deletePerson(personId) {
  if (personId === rootId) {
    return { error: 'Cannot delete the root person.' }
  }

  const person = db.select().from(people).where(eq(people.id, personId)).get()
  if (!person) {
    return { error: 'Person not found.' }
  }

  const ownPhotos = db.select().from(photos).where(eq(photos.personId, personId)).all()
  for (const photo of ownPhotos) {
    await deletePhotoFile(photo.filePath)
  }
  db.delete(photos).where(eq(photos.personId, personId)).run()

  // Unlinks this person from their own parents — harmless on its own,
  // doesn't touch the parents or any siblings.
  db.delete(parentage).where(eq(parentage.childId, personId)).run()

  const ownMarriages = db
    .select()
    .from(marriages)
    .where(or(eq(marriages.spouse1Id, personId), eq(marriages.spouse2Id, personId)))
    .all()

  for (const marriage of ownMarriages) {
    const isSpouse1 = marriage.spouse1Id === personId
    const otherSpouseId = isSpouse1 ? marriage.spouse2Id : marriage.spouse1Id

    if (otherSpouseId) {
      // The marriage (and any children from it) survive with just the
      // remaining spouse — promote them into spouse1Id if that's the slot
      // being vacated, since spouse1Id can't be null.
      const update = isSpouse1 ? { spouse1Id: otherSpouseId, spouse2Id: null } : { spouse2Id: null }
      db.update(marriages).set(update).where(eq(marriages.id, marriage.id)).run()
    } else {
      // This person was the only recorded spouse — nothing else can anchor
      // the marriage once they're gone. Any children lose their link to
      // this parent (the children themselves aren't deleted).
      const marriagePhotos = db
        .select()
        .from(photos)
        .where(eq(photos.marriageId, marriage.id))
        .all()
      for (const photo of marriagePhotos) {
        await deletePhotoFile(photo.filePath)
      }
      db.delete(photos).where(eq(photos.marriageId, marriage.id)).run()
      db.delete(parentage).where(eq(parentage.marriageId, marriage.id)).run()
      db.delete(marriages).where(eq(marriages.id, marriage.id)).run()
    }
  }

  db.delete(people).where(eq(people.id, personId)).run()

  revalidatePath('/')
  return { error: null, ...getTreeData() }
}

// Connects two existing people as child-of/parent-of/spouse-of, applying
// the "never create a marriage duplicating one that already exists" rule
// from specs/link-relationships/spec.md before creating or filling one.
// `formData` always carries `relationship`, plus fields specific to it:
// `parent1Id`/`parent2Id` (child-of, no recorded parent yet),
// `otherParentId` (child-of, one recorded parent), `childId` (parent-of),
// or `spouseId` (spouse-of).
export async function linkPerson(personId, _prevState, formData) {
  const relationship = formData.get('relationship')?.toString() ?? ''

  const person = db.select().from(people).where(eq(people.id, personId)).get()
  if (!person) return { error: 'Person not found.' }

  const treeData = getTreeData()
  const { marriages: marriageRows, parentage: parentageRows } = treeData

  const personExists = (id) => Boolean(id) && id in treeData.people

  // Composite ids (`parent1Id-parent2Id`) match the sample data's own
  // convention — see specs/people-and-relationships/spec.md. A collision
  // (two different marriages that would compute the same base id) is an
  // accepted rough edge elsewhere in this codebase; disambiguated here
  // with a numeric suffix rather than left to silently clash.
  function makeMarriageId(spouse1Id, spouse2Id) {
    const base = `${spouse1Id}-${spouse2Id ?? 'unknown'}`
    let id = base
    let suffix = 2
    while (marriageRows.some((m) => m.id === id)) {
      id = `${base}-${suffix}`
      suffix += 1
    }
    return id
  }

  function createMarriage(spouse1Id, spouse2Id) {
    const id = makeMarriageId(spouse1Id, spouse2Id)
    db.insert(marriages).values({ id, spouse1Id, spouse2Id: spouse2Id ?? null }).run()
    return id
  }

  function fillGap(marriageId, spouseId) {
    db.update(marriages).set({ spouse2Id: spouseId }).where(eq(marriages.id, marriageId)).run()
  }

  // A person has at most one parentage row as a child (see
  // specs/people-and-relationships/spec.md), so this is always either a
  // fresh insert or a reassignment of that one existing row.
  function setChildMarriage(childId, marriageId) {
    const hasExisting = parentageRows.some((p) => p.childId === childId)
    if (hasExisting) {
      db.update(parentage).set({ marriageId }).where(eq(parentage.childId, childId)).run()
    } else {
      db.insert(parentage).values({ marriageId, childId }).run()
    }
  }

  if (relationship === 'child-of') {
    const state = getParentState(personId, marriageRows, parentageRows)
    if (state.state === 'two') {
      return { error: `${person.name} already has two parents.` }
    }

    if (state.state === 'none') {
      const parent1Id = formData.get('parent1Id')?.toString() ?? ''
      const parent2Id = formData.get('parent2Id')?.toString() || null
      if (!personExists(parent1Id) || parent1Id === personId) {
        return { error: 'Choose a valid first parent.' }
      }
      if (parent2Id && (!personExists(parent2Id) || parent2Id === personId || parent2Id === parent1Id)) {
        return { error: 'Choose a valid second parent.' }
      }

      let marriageId
      if (parent2Id) {
        const existing = findMarriage(marriageRows, parent1Id, parent2Id)
        marriageId = existing ? existing.id : createMarriage(parent1Id, parent2Id)
      } else {
        const existing = findIncompleteMarriage(marriageRows, parent1Id)
        marriageId = existing ? existing.id : createMarriage(parent1Id, null)
      }
      setChildMarriage(personId, marriageId)
    } else {
      const otherParentId = formData.get('otherParentId')?.toString() ?? ''
      const knownParentId = state.knownParentId
      if (!personExists(otherParentId) || otherParentId === personId || otherParentId === knownParentId) {
        return { error: 'Choose a valid other parent.' }
      }

      const existingPair = findMarriage(marriageRows, knownParentId, otherParentId)
      if (existingPair) {
        setChildMarriage(personId, existingPair.id)
      } else if (!marriageHasChildren(state.marriageId, parentageRows, personId)) {
        fillGap(state.marriageId, otherParentId)
      } else {
        setChildMarriage(personId, createMarriage(knownParentId, otherParentId))
      }
    }
  } else if (relationship === 'parent-of') {
    const childId = formData.get('childId')?.toString() ?? ''
    if (!personExists(childId) || childId === personId) {
      return { error: 'Choose a valid child.' }
    }

    const state = getParentState(childId, marriageRows, parentageRows)
    if (state.state === 'two') {
      return { error: 'That person already has two parents.' }
    }

    if (state.state === 'none') {
      const existing = findIncompleteMarriage(marriageRows, personId)
      setChildMarriage(childId, existing ? existing.id : createMarriage(personId, null))
    } else {
      const knownParentId = state.knownParentId
      if (knownParentId === personId) {
        return { error: `${person.name} is already a parent of that person.` }
      }

      const existingPair = findMarriage(marriageRows, knownParentId, personId)
      if (existingPair) {
        setChildMarriage(childId, existingPair.id)
      } else if (!marriageHasChildren(state.marriageId, parentageRows, childId)) {
        fillGap(state.marriageId, personId)
      } else {
        setChildMarriage(childId, createMarriage(knownParentId, personId))
      }
    }
  } else if (relationship === 'spouse-of') {
    const spouseId = formData.get('spouseId')?.toString() ?? ''
    if (!personExists(spouseId) || spouseId === personId) {
      return { error: 'Choose a valid spouse.' }
    }
    if (findMarriage(marriageRows, personId, spouseId)) {
      return { error: `${person.name} is already married to that person.` }
    }

    const existing = findIncompleteMarriage(marriageRows, personId)
    if (existing && !marriageHasChildren(existing.id, parentageRows, null)) {
      fillGap(existing.id, spouseId)
    } else {
      createMarriage(personId, spouseId)
    }
  } else {
    return { error: 'Choose a relationship.' }
  }

  revalidatePath('/')
  return { error: null, ...getTreeData() }
}
