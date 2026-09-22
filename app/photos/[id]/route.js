import fs from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { db } from '../../../src/db/client'
import { photos } from '../../../src/db/schema'
import { resolvePhotoPath, mimeTypeFor } from '../../../src/storage/photos'

export async function GET(_request, { params }) {
  const { id } = await params
  const photo = db.select().from(photos).where(eq(photos.id, Number(id))).get()
  if (!photo) return new Response('Not found', { status: 404 })

  const absolutePath = resolvePhotoPath(photo.filePath)
  const file = await fs.readFile(absolutePath)
  return new Response(file, { headers: { 'Content-Type': mimeTypeFor(absolutePath) } })
}
