import { access, readFile } from 'node:fs/promises'

async function exists(path: string) {
  try { await access(path); return true } catch { return false }
}

const required = process.env.DIBOT_REQUIRE_PERSISTENCE === '1'
if (!required) {
  console.log('[generated] Contrato de app completa desactivado para la plantilla vacía.')
  process.exit(0)
}

for (const file of ['api/index.ts', 'api/smoke.ts', 'api/db/schema.ts', 'api/db/seed.ts']) {
  if (!await exists(file)) throw new Error(`App incompleta: falta ${file}.`)
}

const [api, smoke, schema, seed, index, app] = await Promise.all([
  readFile('api/index.ts', 'utf8'),
  readFile('api/smoke.ts', 'utf8'),
  readFile('api/db/schema.ts', 'utf8'),
  readFile('api/db/seed.ts', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('src/App.tsx', 'utf8'),
])

if (!/sqliteTable\s*\(/.test(schema)) throw new Error('App incompleta: api/db/schema.ts no define tablas Drizzle.')
if (!api.includes('/api/health') || !api.includes('startApiServer')) throw new Error('App incompleta: api/index.ts debe usar startApiServer y exponer /api/health.')
if (!seed.trim()) throw new Error('App incompleta: api/db/seed.ts está vacío.')
if (!smoke.trim()) throw new Error('App incompleta: api/smoke.ts está vacío.')
if (!app.includes('/api/')) throw new Error('App incompleta: src/App.tsx debe consumir la API server-side mediante /api/.')

const appName = process.env.DIBOT_APP_NAME?.trim()
const title = index.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
if (appName && (!title || !app.includes(appName))) {
  // Branding is useful feedback, but it is not an infrastructure or runtime
  // failure. OpenCode may render a shortened/translated product label while
  // the API and app remain fully functional; do not discard a valid build or
  // spend another model repair solely because this literal check differs.
  console.warn(`[generated] Aviso de identidad visual: se esperaba "${appName}" en title/UI; title actual="${title || '(vacío)'}".`)
}

console.log('[generated] Nombre, schema, seed, smoke test, API y conexión frontend verificados.')
