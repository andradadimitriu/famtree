'use server'

// Mutations for the person detail panel. No auth — this assumes a single
// local user, per specs/persistence/spec.md. See specs/person-details/spec.md.

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from './client.js'
import { people, photos } from './schema.js'
import { savePhotoFile, deletePhotoFile } from '../storage/photos.js'

export async function updatePersonBio(personId, _prevState, formData) {
  const bio = formData.get('bio')?.toString() ?? ''
  db.update(people).set({ bio }).where(eq(people.id, personId)).run()
  revalidatePath('/')
  return { error: null }
}

// Also returns the created photo, not just an error — the inline
// insert-image flow in the Markdown editor calls this directly (not
// through a <form>) and needs the URL back to splice into the textarea.
// See specs/person-details/spec.md.
export async function uploadPersonPhoto(personId, _prevState, formData) {
  const file = formData.get('file')
  const caption = formData.get('caption')?.toString() || null

  let filePath
  try {
    filePath = await savePhotoFile(personId, file)
  } catch (error) {
    return { error: error.message, photo: null }
  }

  const [photo] = db
    .insert(photos)
    .values({ personId, filePath, caption })
    .returning()
    .all()

  revalidatePath('/')
  return { error: null, photo: { id: photo.id, url: `/photos/${photo.id}`, caption } }
}

export async function deletePersonPhoto(photoId) {
  const photo = db.select().from(photos).where(eq(photos.id, photoId)).get()
  if (!photo) return

  db.delete(photos).where(eq(photos.id, photoId)).run()
  await deletePhotoFile(photo.filePath)
  revalidatePath('/')
}
