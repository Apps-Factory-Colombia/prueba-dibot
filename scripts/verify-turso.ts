import 'dotenv/config'
import { access, readFile } from 'node:fs/promises'
import { createClient } from '@libsql/client'

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
