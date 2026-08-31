import 'dotenv/config'
import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name}; R2 es obligatorio para las apps generadas.`)
  return value
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'app'
}

function storagePrefix(): string {
  const appId = required('DIBOT_APP_ID')
  const appName = process.env.DIBOT_APP_NAME?.trim() || 'dibot-app'
  const suffix = createHash('sha256').update(appId).digest('hex').slice(0, 10)
  return `apps/${slug(appName)}-${suffix}`
}

function mergeEnv(source: string, values: Record<string, string>): string {
  const lines = source.split(/\r?\n/)
  const replaced = new Set<string>()
  const result = lines.map((line) => {
    const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]
    if (!key || !(key in values)) return line
    replaced.add(key)
    return `${key}=${values[key]}`
  })
  for (const [key, value] of Object.entries(values)) if (!replaced.has(key)) result.push(`${key}=${value}`)
  return `${result.join('\n').replace(/\s*$/, '')}\n`
}

const endpoint = required('ENDPOINT_S3')
const accessKeyId = required('R2_ACCESS_KEY_ID')
const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
const bucket = process.env.R2_BUCKET?.trim() || 'dibot'
const appId = required('DIBOT_APP_ID')
const appName = process.env.DIBOT_APP_NAME?.trim() || 'Dibot App'
const prefix = storagePrefix()
const configuredAuthSessionSecret = process.env.AUTH_SESSION_SECRET?.trim()
const agentToken = process.env.DIBOT_AGENT_API_TOKEN?.trim()
const authSessionSecret = configuredAuthSessionSecret
  || (agentToken
    ? createHash('sha256').update(`${agentToken}:${process.env.DIBOT_APP_ID}:dibot-session`).digest('base64url')
    : process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('Falta AUTH_SESSION_SECRET y no hay DIBOT_AGENT_API_TOKEN para generarlo de forma segura.') })()
      : randomBytes(32).toString('base64url'))
const metadata = {
  // S3 user metadata is included in the SigV4 canonical request. Keep it
  // strictly ASCII: app names are user input and may contain accents or
  // characters whose encoding differs between the signer and R2.
  'dibot-app-id': appId,
}
const client = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  // Cloudflare R2 signs the S3 request itself; optional AWS checksum
  // headers can make PutObject signatures incompatible with R2.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

await client.send(new HeadBucketCommand({ Bucket: bucket }))
await client.send(new PutObjectCommand({
  Bucket: bucket,
  Key: `${prefix}/.dibot-storage.json`,
  Body: JSON.stringify({ appId, appName, createdAt: new Date().toISOString() }),
  ContentType: 'application/json',
  Metadata: metadata,
}))

const values = {
  STORAGE_PROVIDER: 's3',
  STORAGE_ENDPOINT: endpoint,
  STORAGE_BUCKET: bucket,
  STORAGE_PREFIX: prefix,
  AUTH_SESSION_SECRET: authSessionSecret,
  ...(process.env.R2_PUBLIC_URL?.trim() ? { STORAGE_PUBLIC_URL: process.env.R2_PUBLIC_URL.trim() } : {}),
}
let current = ''
try { current = await readFile('.env', 'utf8') } catch { /* The workflow normally creates .env before this step. */ }
await writeFile('.env', mergeEnv(current, values), 'utf8')
await writeFile('.env.storage', Object.entries(values).map(([key, value]) => `${key}=${value}`).concat('').join('\n'), 'utf8')
console.log(`[storage] Namespace R2 listo: ${prefix} en ${bucket}.`)
