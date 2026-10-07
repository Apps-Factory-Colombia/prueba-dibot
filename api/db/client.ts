import { config as loadEnv } from 'dotenv'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

// Local development keeps the runtime connection in the generated .env.turso
// file, while app metadata may live in .env. Load .env.turso last so its
// database URL/token win over the organization-level values in .env.
loadEnv()
if (process.env.DIBOT_PREVIEW_BUNDLE !== '1') {
  loadEnv({ path: '.env.turso', override: true })
}

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Configure the server environment first.')
}

export const tursoClient = createClient({ url, authToken })
export const db = drizzle({ client: tursoClient })
