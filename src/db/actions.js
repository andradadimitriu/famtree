'use server'

// Mutations for the person detail panel. No auth — this assumes a single
// local user, per specs/persistence/spec.md. See specs/person-details/spec.md.

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from './client.js'
import { people, photos } from './schema.js'
import { savePhotoFile, deletePhotoFile } from '../storage/photos.js'
import { parsePartialDate } from '../lib/partialDate.js'

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
