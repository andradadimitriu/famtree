/** @type {import('next').NextConfig} */
const nextConfig = {
  // Without this, Turbopack finds a stray package-lock.json in the parent
  // directory (an unrelated project outside this repo) and warns about it.
  turbopack: {
    root: import.meta.dirname,
  },
}

export default nextConfig
