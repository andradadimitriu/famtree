/** @type {import('next').NextConfig} */
const nextConfig = {
  // Without this, Turbopack finds a stray package-lock.json in the parent
  // directory (an unrelated project outside this repo) and warns about it.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    serverActions: {
      // `uploadPersonPhoto` (src/db/actions.js) accepts multiple images per
      // submit, and the default 1MB cap is well under a single phone photo.
      bodySizeLimit: '50mb',
    },
  },
}

export default nextConfig
