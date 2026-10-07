import { config as loadEnv } from 'dotenv'
import { access, readFile } from 'node:fs/promises'
import { createClient } from '@libsql/client'

loadEnv()
loadEnv({ path: '.env.turso', override: true })

async function exists(path: string) {
  try { await access(path); return true } catch { return false }
}

const schema = await readFile('api/db/schema.ts', 'utf8')
const hasTables = /sqliteTable\s*\(/.test(schema)
const hasServerEntry = await exists('api/index.ts')
const required = process.env.DIBOT_REQUIRE_PERSISTENCE === '1'
const requireSeed = process.env.DIBOT_REQUIRE_SEED === '1'

if (!hasTables && !hasServerEntry) {
  if (required) throw new Error('Persistencia obligatoria: faltan tablas Drizzle y api/index.ts.')
  console.log('[turso] Plantilla vacía sin persistencia; se omite la conexión.')
} else {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
  const databaseId = process.env.TURSO_DATABASE_ID?.trim()
  if (!url || !authToken || !databaseId) throw new Error('Turso no está listo: requiere TURSO_DATABASE_URL, TURSO_AUTH_TOKEN y TURSO_DATABASE_ID.')

  const client = createClient({ url, authToken })
  const result = await client.execute('select 1 as ok')
  if (result.rows[0]?.ok !== 1) throw new Error('Turso respondió con un resultado inválido.')

  const tableResult = await client.execute("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations' order by name")
  const tables = tableResult.rows.map((row) => String(row.name))
  if (required && tables.length === 0) throw new Error('Turso conecta, pero la base no contiene tablas de la aplicación.')

  const requiredColumns: Record<string, string[]> = {
    users: ['id', 'email', 'password_hash', 'role', 'profile_identity', 'name', 'age', 'country', 'city', 'bio', 'occupation', 'salary', 'economic_activity', 'status', 'plan', 'created_at', 'updated_at', 'paid_at'],
    registration_leads: ['email_hash', 'started_at', 'last_seen_at'],
  }
  const schemaIssues: string[] = []
  for (const [table, expectedColumns] of Object.entries(requiredColumns)) {
    if (!tables.includes(table)) {
      schemaIssues.push(`falta la tabla ${table}`)
      continue
    }
    const escaped = table.replaceAll('"', '""')
    const info = await client.execute(`pragma table_info("${escaped}")`)
    const actualColumns = new Set(info.rows.map((column) => String(column.name)))
    const missingColumns = expectedColumns.filter((column) => !actualColumns.has(column))
    if (missingColumns.length) schemaIssues.push(`${table}: faltan columnas ${missingColumns.join(', ')}`)
  }
  if (schemaIssues.length) throw new Error(`Esquema de Turso incompleto: ${schemaIssues.join('; ')}. Ejecuta bun run db:migrate.`)

  const counts = await Promise.all(tables.map(async (table) => {
    const escaped = table.replaceAll('"', '""')
    const countResult = await client.execute(`select count(*) as count from "${escaped}"`)
    return { table, count: Number(countResult.rows[0]?.count ?? 0) }
  }))
  if (requireSeed) {
    // Empty transactional tables are valid on a fresh app: appointments,
    // reservations, order_items and similar tables wait for the first user.
    // The old all-tables rule rejected healthy apps. Only fail when the seed
    // produced no rows at all; report empty tables as diagnostics.
    const totalRows = counts.reduce((sum, item) => sum + item.count, 0)
    if (totalRows < 1) throw new Error('Seed incompleto: ninguna tabla contiene datos iniciales.')
    const emptyTables = counts.filter((item) => item.count === 0).map((item) => item.table)
    if (emptyTables.length > 0) console.log(`[turso] Tablas vacías permitidas para datos transaccionales: ${emptyTables.join(', ')}.`)
  }

  console.log(`[turso] Conexión verificada para ${databaseId}; ${tables.length} tabla(s)${requireSeed ? ' con seed inicial válido' : ''}.`)
}
