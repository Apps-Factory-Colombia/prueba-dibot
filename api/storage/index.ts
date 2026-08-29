import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuth } from '../auth/session'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

export type StorageVisibility = 'public' | 'private'

export type ThumbnailOptions = {
  width?: number
  height?: number
  quality?: number
}

export type StorageUploadInput = {
  body: Uint8Array | ArrayBuffer
  fileName: string
  contentType: string
  key?: string
  visibility?: StorageVisibility
  metadata?: Record<string, string>
  thumbnail?: boolean | ThumbnailOptions
}

export type StoredFile = {
  key: string
  fileName: string
  contentType: string
  size: number
  visibility: StorageVisibility
  metadata: Record<string, string>
  thumbnailKey?: string
  createdAt: string
}

export type StoredObject = StoredFile & {
  body: Uint8Array
}

export type Storage = {
  upload(input: StorageUploadInput): Promise<StoredFile>
  getUrl(key: string, expiresInSeconds?: number): Promise<string>
  delete(key: string): Promise<void>
  read(key: string): Promise<StoredObject | null>
}

const defaultAllowedContentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function required(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`Falta ${name} para usar el storage.`)
  return value
}

function asBuffer(body: Uint8Array | ArrayBuffer): Buffer {
  return body instanceof ArrayBuffer ? Buffer.from(body) : Buffer.from(body)
}

function maxFileSizeBytes(): number {
  const configured = Number(env('STORAGE_MAX_FILE_SIZE_BYTES') ?? 15 * 1024 * 1024)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 15 * 1024 * 1024
}

function allowedContentTypes(): Set<string> {
  const configured = env('STORAGE_ALLOWED_CONTENT_TYPES')
  if (!configured || configured === '*') return defaultAllowedContentTypes
  return new Set(configured.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))
}

function safeKey(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error('La clave del archivo no es segura.')
  }
  return normalized
}

function safeSegment(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'app'
}

function storagePrefix(): string {
  const configured = env('STORAGE_PREFIX')
  if (configured) return safeKey(configured)
  return `apps/${safeSegment(env('DIBOT_APP_NAME') ?? 'dibot-app')}-${safeSegment(env('DIBOT_APP_ID') ?? 'local')}`
}

function scopedKey(value: string): string {
  const key = safeKey(value)
  const prefix = storagePrefix()
  return key === prefix || key.startsWith(`${prefix}/`) ? key : `${prefix}/${key}`
}

function generatedKey(fileName: string, contentType: string): string {
  const extension = fileName.split('.').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    || contentType.split('/').at(-1)?.replace(/[^a-z0-9]/g, '').slice(0, 8)
    || 'bin'
  return `${storagePrefix()}/files/${randomUUID()}.${extension}`
}

function cleanMetadata(metadata: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata ?? {}).map(([key, value]) => [
    key.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64),
    String(value).slice(0, 1024),
  ]).filter(([key, value]) => Boolean(key && value)))
}

export function validateUpload(input: Pick<StorageUploadInput, 'body' | 'contentType' | 'fileName'>): void {
  const contentType = input.contentType.trim().toLowerCase()
  const size = input.body instanceof ArrayBuffer ? input.body.byteLength : input.body.byteLength
  if (!contentType || !allowedContentTypes().has(contentType)) {
    throw new Error(`Tipo de archivo no permitido: ${contentType || 'desconocido'}.`)
  }
  if (size <= 0) throw new Error('El archivo está vacío.')
  if (size > maxFileSizeBytes()) {
    throw new Error(`El archivo supera el máximo de ${Math.round(maxFileSizeBytes() / 1024 / 1024)} MB.`)
  }
  if (!input.fileName.trim()) throw new Error('El archivo necesita un nombre.')
}

function metadataForObject(input: StorageUploadInput, createdAt: string, thumbnailKey?: string): Record<string, string> {
  return {
    ...cleanMetadata(input.metadata),
    'dibot-file-name': input.fileName.slice(0, 255),
    'dibot-visibility': input.visibility ?? 'private',
    'dibot-created-at': createdAt,
    ...(thumbnailKey ? { 'dibot-thumbnail-key': thumbnailKey } : {}),
  }
}

async function buildThumbnail(body: Buffer, contentType: string, options: ThumbnailOptions): Promise<Buffer | undefined> {
  if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') return undefined
  return await sharp(body)
    .resize({
      width: Math.max(64, Math.min(2_000, options.width ?? 480)),
      height: Math.max(64, Math.min(2_000, options.height ?? 480)),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: Math.max(40, Math.min(95, options.quality ?? 82)) })
    .toBuffer()
}

function localRoot(): string {
  return resolve(env('STORAGE_LOCAL_DIR') ?? '.storage')
}

function localPath(key: string): string {
  const root = localRoot()
  const target = resolve(root, safeKey(key))
  if (target !== root && !target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) {
    throw new Error('La ruta local del archivo no es segura.')
  }
  return target
}

function localMetadataPath(key: string): string {
  return `${localPath(key)}.json`
}

function localUrl(key: string): string {
  const base = env('STORAGE_LOCAL_PUBLIC_URL') ?? '/api/storage/file'
  return `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`
}

class LocalStorage implements Storage {
  async upload(input: StorageUploadInput): Promise<StoredFile> {
    validateUpload(input)
    const body = asBuffer(input.body)
    const key = input.key ? scopedKey(input.key) : generatedKey(input.fileName, input.contentType)
    const createdAt = new Date().toISOString()
    let thumbnailKey: string | undefined
    try {
      if (input.thumbnail) {
        const thumbnail = await buildThumbnail(body, input.contentType, input.thumbnail === true ? {} : input.thumbnail)
        if (thumbnail) {
          thumbnailKey = `${key}.thumb.webp`
          await mkdir(dirname(localPath(thumbnailKey)), { recursive: true })
          await writeFile(localPath(thumbnailKey), thumbnail)
        }
      }
      await mkdir(dirname(localPath(key)), { recursive: true })
      await writeFile(localPath(key), body)
      const result = {
        key,
        fileName: input.fileName,
        contentType: input.contentType,
        size: body.byteLength,
        visibility: input.visibility ?? 'private',
        metadata: cleanMetadata(input.metadata),
        ...(thumbnailKey ? { thumbnailKey } : {}),
        createdAt,
      } satisfies StoredFile
      await writeFile(localMetadataPath(key), JSON.stringify(result, null, 2))
      return result
    } catch (error) {
      await rm(localPath(key), { force: true }).catch(() => undefined)
      if (thumbnailKey) await rm(localPath(thumbnailKey), { force: true }).catch(() => undefined)
      throw error
    }
  }

  async getUrl(key: string): Promise<string> {
    return localUrl(scopedKey(key))
  }

  async delete(key: string): Promise<void> {
    const normalized = scopedKey(key)
    let metadata: StoredFile | undefined
    try { metadata = JSON.parse(await readFile(localMetadataPath(normalized), 'utf8')) as StoredFile } catch { /* already absent */ }
    await rm(localPath(normalized), { force: true })
    await rm(localMetadataPath(normalized), { force: true })
    if (metadata?.thumbnailKey) await rm(localPath(metadata.thumbnailKey), { force: true })
  }

  async read(key: string): Promise<StoredObject | null> {
    const normalized = scopedKey(key)
    try {
      const metadata = JSON.parse(await readFile(localMetadataPath(normalized), 'utf8')) as StoredFile
      return { ...metadata, body: await readFile(localPath(normalized)) }
    } catch {
      return null
    }
  }
}

type S3Config = {
  client: S3Client
  bucket: string
  endpoint?: string
  publicUrl?: string
}

let s3Config: S3Config | undefined

function s3(): S3Config {
  if (!s3Config) {
    const endpoint = env('STORAGE_ENDPOINT') ?? env('ENDPOINT_S3')
    s3Config = {
      client: new S3Client({
        region: 'auto',
        ...(endpoint ? { endpoint } : {}),
        credentials: {
          accessKeyId: required('R2_ACCESS_KEY_ID'),
          secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
        },
        // Avoid optional checksum headers that can invalidate R2 signatures.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
      bucket: env('STORAGE_BUCKET') ?? env('R2_BUCKET') ?? 'dibot',
      endpoint,
      publicUrl: env('STORAGE_PUBLIC_URL') ?? env('R2_PUBLIC_URL'),
    }
  }
  return s3Config
}

function publicObjectUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

class S3Storage implements Storage {
  async upload(input: StorageUploadInput): Promise<StoredFile> {
    validateUpload(input)
    const config = s3()
    const body = asBuffer(input.body)
    const key = input.key ? scopedKey(input.key) : generatedKey(input.fileName, input.contentType)
    const createdAt = new Date().toISOString()
    let thumbnailKey: string | undefined
    try {
      if (input.thumbnail) {
        const thumbnail = await buildThumbnail(body, input.contentType, input.thumbnail === true ? {} : input.thumbnail)
        if (thumbnail) {
          thumbnailKey = `${key}.thumb.webp`
          await config.client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: thumbnailKey,
            Body: thumbnail,
            ContentType: 'image/webp',
            ContentLength: thumbnail.byteLength,
            CacheControl: 'public, max-age=31536000, immutable',
          }))
        }
      }
      await config.client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: input.contentType,
        ContentLength: body.byteLength,
        CacheControl: input.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=0',
        Metadata: metadataForObject(input, createdAt, thumbnailKey),
      }))
      return {
        key,
        fileName: input.fileName,
        contentType: input.contentType,
        size: body.byteLength,
        visibility: input.visibility ?? 'private',
        metadata: cleanMetadata(input.metadata),
        ...(thumbnailKey ? { thumbnailKey } : {}),
        createdAt,
      }
    } catch (error) {
      await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => undefined)
      if (thumbnailKey) await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: thumbnailKey })).catch(() => undefined)
      throw error
    }
  }

  async getUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const config = s3()
    const normalized = scopedKey(key)
    const object = await config.client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: normalized }))
    const visibility = object.Metadata?.['dibot-visibility'] === 'public' ? 'public' : 'private'
    if (visibility === 'public' && config.publicUrl) return publicObjectUrl(config.publicUrl, normalized)
    return await getSignedUrl(config.client, new GetObjectCommand({ Bucket: config.bucket, Key: normalized }), {
      expiresIn: Math.max(60, Math.min(86_400, expiresInSeconds)),
    })
  }

  async delete(key: string): Promise<void> {
    const config = s3()
    const normalized = scopedKey(key)
    let thumbnailKey: string | undefined
    try {
      const head = await config.client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: normalized }))
      thumbnailKey = head.Metadata?.['dibot-thumbnail-key']
    } catch { /* deleting a missing object is idempotent */ }
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: normalized }))
    if (thumbnailKey) await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: thumbnailKey }))
  }

  async read(key: string): Promise<StoredObject | null> {
    const config = s3()
    const normalized = scopedKey(key)
    try {
      const result = await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: normalized }))
      if (!result.Body) return null
      const body = await result.Body.transformToByteArray()
      const metadata = result.Metadata ?? {}
      const visibility = metadata['dibot-visibility'] === 'public' ? 'public' : 'private'
      return {
        key: normalized,
        fileName: metadata['dibot-file-name'] ?? normalized.split('/').at(-1) ?? 'archivo',
        contentType: result.ContentType ?? 'application/octet-stream',
        size: result.ContentLength ?? body.byteLength,
        visibility,
        metadata: Object.fromEntries(Object.entries(metadata).filter(([name]) => !name.startsWith('dibot-'))),
        ...(metadata['dibot-thumbnail-key'] ? { thumbnailKey: metadata['dibot-thumbnail-key'] } : {}),
        createdAt: metadata['dibot-created-at'] ?? new Date().toISOString(),
        body,
      }
    } catch (error) {
      if (error instanceof Error && /not found|nosuchkey|404/i.test(error.message)) return null
      throw error
    }
  }
}

function implementation(): Storage {
  const provider = env('STORAGE_PROVIDER') ?? (process.env.NODE_ENV === 'production' ? 's3' : 'local')
  if (provider === 's3' || provider === 'r2') return new S3Storage()
  return new LocalStorage()
}

let storageImplementation: Storage | undefined

function activeStorage(): Storage {
  return storageImplementation ??= implementation()
}

/** Server-side storage contract used by every generated app. */
export const storage: Storage = {
  upload: (input) => activeStorage().upload(input),
  getUrl: (key, expiresInSeconds) => activeStorage().getUrl(key, expiresInSeconds),
  delete: (key) => activeStorage().delete(key),
  read: (key) => activeStorage().read(key),
}

export async function verifyS3Bucket(): Promise<void> {
  const config = s3()
  await config.client.send(new HeadBucketCommand({ Bucket: config.bucket }))
}

export async function handleStorageRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/storage/file') {
    const key = url.searchParams.get('key')
    if (!key) return new Response(JSON.stringify({ error: 'Falta key.' }), { status: 400, headers: { 'content-type': 'application/json' } })
    const object = await storage.read(key)
    if (!object) return new Response('Not found', { status: 404 })
    if (object.visibility !== 'public') await requireAuth(request)
    return new Response(object.body as unknown as BodyInit, {
      headers: {
        'content-type': object.contentType,
        'cache-control': object.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=0',
        'content-disposition': `inline; filename="${object.fileName.replace(/"/g, '')}"`,
      },
    })
  }
  if (request.method === 'POST' && url.pathname === '/api/storage/upload') {
    await requireAuth(request)
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return new Response(JSON.stringify({ error: 'Envía el archivo en el campo file.' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }
    const uploaded = file as File
    const metadataValue = form.get('metadata')
    const metadata = typeof metadataValue === 'string' && metadataValue.trim() ? JSON.parse(metadataValue) as Record<string, string> : undefined
    const result = await storage.upload({
      body: await uploaded.arrayBuffer(),
      fileName: uploaded.name,
      contentType: uploaded.type,
      visibility: form.get('visibility') === 'public' ? 'public' : 'private',
      metadata,
      thumbnail: form.get('thumbnail') === 'true',
    })
    return new Response(JSON.stringify({ data: result, url: await storage.getUrl(result.key) }), { headers: { 'content-type': 'application/json' } })
  }
  if (request.method === 'DELETE' && url.pathname === '/api/storage/file') {
    await requireAuth(request)
    const body = await request.json() as { key?: string }
    if (!body.key) return new Response(JSON.stringify({ error: 'Falta key.' }), { status: 400, headers: { 'content-type': 'application/json' } })
    await storage.delete(body.key)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ error: 'Ruta de storage no encontrada.' }), { status: 404, headers: { 'content-type': 'application/json' } })
}
