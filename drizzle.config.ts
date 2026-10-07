import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv()
loadEnv({ path: '.env.turso', override: true })

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Copy .env.example and configure Turso first.`)
  return value
}

export default defineConfig({
  dialect: 'turso',
  schema: './api/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: requiredEnv('TURSO_DATABASE_URL'),
    authToken: requiredEnv('TURSO_AUTH_TOKEN'),
  },
})
