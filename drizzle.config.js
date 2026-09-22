import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.js',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/famtree.db',
  },
})
