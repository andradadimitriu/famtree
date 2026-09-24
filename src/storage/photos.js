// The one boundary that knows about absolute filesystem paths for
// uploaded photos — everywhere else deals only with the relative
// `filePath` stored in the `photos` table. See specs/persistence/spec.md.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads')

fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// Resolves a photo's stored relative path to an absolute path on disk,
// rejecting anything that would escape the uploads directory.
export function resolvePhotoPath(filePath) {
  const absolute = path.join(UPLOADS_DIR, filePath)
  if (absolute !== UPLOADS_DIR && !absolute.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error(`Invalid photo path: ${filePath}`)
  }
  return absolute
}

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

export function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

const ALLOWED_UPLOAD_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

// Validates and writes an uploaded photo `File` to disk, returning the
// relative path to store in the `photos` table. See
// specs/person-details/spec.md.
export async function savePhotoFile(personId, file) {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file provided')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is too large (max 15MB)')
  }
  const ext = ALLOWED_UPLOAD_TYPES[file.type]
  if (!ext) {
    throw new Error('Only JPEG, PNG, WebP, or GIF images are supported')
  }

  const filename = `${personId}-${Date.now()}-${crypto.randomUUID()}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.promises.writeFile(resolvePhotoPath(filename), buffer)
  return filename
}

export async function deletePhotoFile(filePath) {
  await fs.promises.rm(resolvePhotoPath(filePath), { force: true })
}
