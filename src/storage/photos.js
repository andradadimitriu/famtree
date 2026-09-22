// The one boundary that knows about absolute filesystem paths for
// uploaded photos — everywhere else deals only with the relative
// `filePath` stored in the `photos` table. See specs/persistence/spec.md.

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
