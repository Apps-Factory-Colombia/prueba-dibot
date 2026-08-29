import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type AuthRole = string

export type SessionUser = {
  userId: string
  role?: AuthRole
  email?: string
  name?: string
  [key: string]: unknown
}

export type Session = SessionUser & {
  issuedAt: number
  expiresAt: number
}

const defaultSessionTtlSeconds = 60 * 60 * 24 * 7
const cookieName = 'dibot_session'

function requiredSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta AUTH_SESSION_SECRET para iniciar sesiones en producción.')
  }
  return 'local-development-only-change-this-secret'
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function signature(payload: string): string {
  return base64Url(createHmac('sha256', requiredSecret()).update(payload).digest())
}

function ttlSeconds(): number {
  const value = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? defaultSessionTtlSeconds)
  return Number.isFinite(value) && value >= 300 ? Math.min(Math.floor(value), 60 * 60 * 24 * 30) : defaultSessionTtlSeconds
}

function cookieHeader(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === '1'
  return [
    `${cookieName}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

function readCookie(request: Request): string | undefined {
  const cookies = request.headers.get('cookie')?.split(';') ?? []
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${cookieName}=`))
  return entry?.trim().slice(cookieName.length + 1) || undefined
}

function safeUser(user: SessionUser): SessionUser {
  const userId = user.userId?.trim()
  if (!userId) throw new Error('userId es requerido para crear una sesión.')
  return {
    userId,
    ...(user.role ? { role: user.role } : {}),
    ...(user.email ? { email: user.email } : {}),
    ...(user.name ? { name: user.name } : {}),
  }
}

export function createSession(user: SessionUser, now = Date.now()): Session {
  const issuedAt = Math.floor(now / 1000)
  return { ...safeUser(user), issuedAt, expiresAt: issuedAt + ttlSeconds() }
}

export function createSessionToken(user: SessionUser, now = Date.now()): string {
  const payload = base64Url(Buffer.from(JSON.stringify(createSession(user, now)), 'utf8'))
  return `${payload}.${signature(payload)}`
}

export function sessionCookie(user: SessionUser, now = Date.now()): string {
  return cookieHeader(createSessionToken(user, now), ttlSeconds())
}

export function clearSessionCookie(): string {
  return cookieHeader('', 0)
}

export function sessionHeaders(user: SessionUser, now = Date.now()): Headers {
  const headers = new Headers()
  headers.set('set-cookie', sessionCookie(user, now))
  return headers
}

export function clearSessionHeaders(): Headers {
  const headers = new Headers()
  headers.set('set-cookie', clearSessionCookie())
  return headers
}

export async function getSession(request: Request, now = Date.now()): Promise<Session | null> {
  const token = readCookie(request)
  if (!token) return null
  const [payload, encodedSignature] = token.split('.')
  if (!payload || !encodedSignature) return null
  const expected = fromBase64Url(signature(payload))
  const actual = fromBase64Url(encodedSignature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const session = JSON.parse(fromBase64Url(payload).toString('utf8')) as Session
    const current = Math.floor(now / 1000)
    if (!session.userId || !Number.isFinite(session.expiresAt) || session.expiresAt <= current) return null
    return session
  } catch {
    return null
  }
}

export async function requireAuth(request: Request): Promise<Session> {
  const session = await getSession(request)
  if (!session) throw new Response(JSON.stringify({ error: 'Autenticación requerida.' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
  return session
}

export async function requireRole(request: Request, roles: AuthRole | AuthRole[]): Promise<Session> {
  const session = await requireAuth(request)
  const allowed = new Set(Array.isArray(roles) ? roles : [roles])
  if (!session.role || !allowed.has(session.role)) {
    throw new Response(JSON.stringify({ error: 'No tienes permisos para esta acción.' }), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  return session
}

export async function getCurrentUser(request: Request): Promise<Session | null> {
  return await getSession(request)
}

export function randomSessionSecret(): string {
  return randomBytes(32).toString('base64url')
}
