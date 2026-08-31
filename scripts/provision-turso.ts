import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'

const apiBase = 'https://api.turso.tech/v1'

type Organization = { slug: string; name: string }
type Group = { name: string; uuid: string }
type Database = { Name: string; DbId: string; Hostname: string; group: string }

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Configure it in .env using .env.example.`)
  return value
}

function platformToken() {
  return process.env.TURSO_PLATFORM_API_TOKEN ?? ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = platformToken()
  if (!token) throw new Error('Missing TURSO_PLATFORM_API_TOKEN. A database token cannot access the Turso Platform API.')
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Turso API ${response.status}: ${body}`)
  return body ? JSON.parse(body) as T : ({} as T)
}

async function context() {
  const organizationSlug = required('TURSO_ORG_SLUG')
  const groupName = process.env.TURSO_GROUP ?? 'dibot'
  const organizations = await request<Organization[]>('/organizations')
  if (!organizations.some((organization) => organization.slug === organizationSlug)) {
    throw new Error(`Organization ${organizationSlug} was not found for this token.`)
  }
  const groups = await request<{ groups: Group[] }>(`/organizations/${encodeURIComponent(organizationSlug)}/groups`)
  if (!groups.groups.some((group) => group.name === groupName)) throw new Error(`Group ${groupName} was not found.`)
  const databases = await request<{ databases: Database[] }>(`/organizations/${encodeURIComponent(organizationSlug)}/databases?group=${encodeURIComponent(groupName)}`)
  return { organizationSlug, groupName, databases: databases.databases }
}

async function check() {
  const { organizationSlug, groupName, databases } = await context()
  const configuredId = process.env.TURSO_DATABASE_ID
  console.log(`Organization: ${organizationSlug}`)
  console.log(`Group: ${groupName}`)
  console.log(`Databases: ${databases.length}`)
  for (const database of databases) console.log(`- ${database.Name} | ${database.DbId}${database.DbId === configuredId ? ' | configured' : ''}`)
  if (configuredId && !databases.some((database) => database.DbId === configuredId)) {
    throw new Error(`TURSO_DATABASE_ID ${configuredId} was not found in group ${groupName}.`)
  }
}

async function writeRuntimeEnv(values: Record<string, string>) {
  let current: string = ''
  try { current = await readFile('.env', 'utf8') } catch { /* .env can be created on first provisioning */ }
  const lines = current.split(/\r?\n/)
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^\\s*${key}=`)
    const index = lines.findIndex((line) => pattern.test(line))
    const entry = `${key}=${value}`
    if (index >= 0) lines[index] = entry
    else lines.push(entry)
  }
  const normalized = lines.filter((line, index) => index < lines.length - 1 || line !== '').join('\n')
  await writeFile('.env', `${normalized}\n`, 'utf8')
}

async function readExistingRuntimeValues() {
  const values = new Map<string, string>()
  for (const file of ['.env.turso', '.env']) {
    let content: string
    try { content = await readFile(file, 'utf8') } catch { continue }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!match || values.has(match[1])) continue
      const value = match[2].replace(/^("|')(.*)\1$/, '$2')
      if (value) values.set(match[1], value)
    }
  }
  return values
}

async function issueDatabaseToken(name: string) {
  const token = await request<{ jwt: string }>(`/organizations/${encodeURIComponent(required('TURSO_ORG_SLUG'))}/databases/${encodeURIComponent(name)}/auth/tokens?expiration=never&authorization=full-access`, { method: 'POST' })
  if (!token.jwt) throw new Error(`Turso no devolvió credenciales para ${name}.`)
  return token.jwt
}

async function persistDatabaseRuntime(database: Database, organizationSlug: string, groupName: string, authToken: string, message: string) {
  const values = {
    TURSO_DATABASE_URL: `libsql://${database.Hostname}`,
    TURSO_AUTH_TOKEN: authToken,
    TURSO_DATABASE_ID: database.DbId,
    TURSO_ORG_SLUG: organizationSlug,
    TURSO_GROUP: groupName,
    TURSO_DATABASE_NAME: database.Name,
  }
  await writeFile('.env.turso', Object.entries(values).map(([key, value]) => `${key}=${value}`).concat('').join('\n'), 'utf8')
  await writeRuntimeEnv(values)
  console.log(`${message} ${database.Name} (${database.DbId}) y actualizó .env plus .env.turso.`)
}

async function create() {
  const { organizationSlug, groupName, databases } = await context()
  const name = process.env.TURSO_DATABASE_NAME ?? 'dibot-app'
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(name)) {
    throw new Error(`Invalid TURSO_DATABASE_NAME "${name}". Use 1-50 lowercase letters, numbers, or hyphens.`)
  }
  const existing = databases.find((database) => database.Name === name)
  if (existing) {
    if (process.env.DIBOT_PARTIAL_CREATE_RECOVERY !== '1') {
      throw new Error(`Database ${name} already exists. Set TURSO_DATABASE_NAME to a new name.`)
    }
    const previous = await readExistingRuntimeValues()
    const previousId = previous.get('TURSO_DATABASE_ID')
    if (previousId && previousId !== existing.DbId) {
      throw new Error(`La recuperación rechazó la base ${name}: TURSO_DATABASE_ID no coincide con la base encontrada.`)
    }
    const authToken = previous.get('TURSO_AUTH_TOKEN') || await issueDatabaseToken(existing.Name)
    await persistDatabaseRuntime(existing, organizationSlug, groupName, authToken, 'Reused existing database during partial recovery:')
    return
  }

  const created = await request<{ database: Database }>(`/organizations/${encodeURIComponent(organizationSlug)}/databases`, {
    method: 'POST',
    body: JSON.stringify({ name, group: groupName }),
  })
  const token = await request<{ jwt: string }>(`/organizations/${encodeURIComponent(organizationSlug)}/databases/${encodeURIComponent(name)}/auth/tokens?expiration=never&authorization=full-access`, { method: 'POST' })
  const database = created.database
  await persistDatabaseRuntime(database, organizationSlug, groupName, token.jwt, 'Created database:')
}

const command = process.argv[2] ?? 'check'
if (command === 'check') await check()
else if (command === 'create') await create()
else throw new Error('Use: bun run db:check or bun run db:create')
