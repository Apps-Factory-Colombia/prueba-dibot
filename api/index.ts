import { and, asc, count, desc, eq, gt, inArray, lt, notInArray, or, sql } from 'drizzle-orm'
import { createHmac, randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { appMeta, matches, messages, paymentEvents, registrationLeads, subscriptions, supportMessages, swipes, userPhotos, users } from './db/schema'
import { db } from './db/client'
import { hashPassword, verifyPassword } from './auth/password'
import { clearSessionHeaders, getCurrentUser, requireAuth, requireRole, sessionHeaders } from './auth/session'
import { handleStorageRequest, storage } from './storage'
import { json, readJson, startApiServer } from './server'
import { runWeeklyNotifications } from './notifications'

const launchPriceMxn = 49
const regularPriceMxn = 299
const registrationAbandonmentMs = 24 * 60 * 60 * 1000
const allowedRoles = new Set(['sugar-daddy', 'sugar-baby'])
const allowedProfileIdentities = new Set(['woman', 'man', 'prefer-not-to-say'])
const imageExtensionTypes: Record<string, string> = {
  apng: 'image/apng', avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  jpe: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml',
  svgz: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp',
}

function stripeMode(): string {
  const configuredMode = process.env.STRIPE_MODE?.trim().toLowerCase()
  // This deployment is being used for test payments only. Never let a live key
  // create a real charge while NODE_ENV is production.
  return process.env.NODE_ENV === 'production' ? 'test' : configuredMode || 'test'
}

function registrationEmailHash(email: string): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim()
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Falta AUTH_SESSION_SECRET para proteger el registro pendiente.')
  return createHmac('sha256', secret || 'local-development-only-change-this-secret').update(email).digest('hex')
}

type RegisterBody = { email?: string; password?: string; role?: string; profileIdentity?: string; name?: string; age?: number | string; country?: string; city?: string; bio?: string; interests?: string[]; occupation?: string; salary?: string; economicActivity?: string }

function text(value: unknown, field: string, max = 500): string {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${field} es obligatorio.`)
  if (result.length > max) throw new Error(`${field} es demasiado largo.`)
  return result
}

function optionalText(value: unknown, max = 500): string | null {
  const result = String(value ?? '').trim()
  return result ? result.slice(0, max) : null
}

function ageValue(value: unknown): number {
  const age = Number(value)
  if (!Number.isInteger(age) || age < 18 || age > 99) throw new Error('La edad debe estar entre 18 y 99 años.')
  return age
}

function emailValue(value: unknown): string {
  const email = text(value, 'El correo', 160).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.')
  return email
}

function profileImageContentType(file: File): string | null {
  const contentType = file.type.trim().toLowerCase()
  if (contentType.startsWith('image/')) return contentType
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
  return imageExtensionTypes[extension] ?? null
}

function isoDate(value: Date | null | undefined): string | null { return value ? value.toISOString() : null }

function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, email: user.email, role: user.role, profileIdentity: user.profileIdentity, name: user.name, age: user.age, country: user.country, city: user.city, bio: user.bio, occupation: user.occupation, salary: user.salary, economicActivity: user.economicActivity, status: user.status, plan: user.plan, createdAt: isoDate(user.createdAt), paidAt: isoDate(user.paidAt) }
}

function isActive(user: typeof users.$inferSelect): boolean { return user.status === 'active' || user.status === 'admin' }
function isFreeAdultMan(user: typeof users.$inferSelect): boolean { return user.role === 'sugar-daddy' && user.age >= 35 }
function requiresPayment(user: typeof users.$inferSelect): boolean { return !isFreeAdultMan(user) && !isActive(user) }
function isLimitedWoman(user: typeof users.$inferSelect): boolean { return user.role === 'sugar-baby' && user.status === 'pending_payment' }
function immediateOffer(user: typeof users.$inferSelect): OfferPayload | null { return user.role === 'sugar-daddy' && user.age < 35 && requiresPayment(user) ? offerResponse() : null }

type OfferPayload = ReturnType<typeof offerResponse>

function offerResponse() {
  return { regularPriceMxn, launchPriceMxn, currency: 'MXN', message: 'Oferta de lanzamiento: paga $49 MXN al mes en lugar de $299 MXN.', paymentMethods: ['card'], recurring: true }
}

function paymentRequiredResponse() { return json({ error: 'PAYMENT_REQUIRED', offer: offerResponse() }, { status: 402 }) }

async function findUser(id: string) { return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null }
async function findUserByEmail(email: string) { return (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null }

async function photoUrl(fileKey: string): Promise<string> {
  return /^https?:\/\//i.test(fileKey) ? fileKey : await storage.getUrl(fileKey)
}

async function profileWithPhotos(user: typeof users.$inferSelect) {
  const photos = await db.select().from(userPhotos).where(eq(userPhotos.userId, user.id)).orderBy(asc(userPhotos.position))
  return { ...publicUser(user), photos: await Promise.all(photos.map(async (photo) => ({ id: photo.id, position: photo.position, url: await photoUrl(photo.fileKey) }))) }
}

async function currentDbUser(request: Request) {
  const session = await getCurrentUser(request)
  if (!session || session.userId === 'admin') return null
  return await findUser(session.userId)
}

function adminUser() { return { id: 'admin', email: process.env.ADMIN_EMAIL?.trim() || 'admin', role: 'admin', profileIdentity: null, name: 'Administrador', age: 0, city: '', bio: '', occupation: null, salary: null, economicActivity: null, status: 'admin', plan: 'admin', createdAt: null, paidAt: null } }
function orderedPair(a: string, b: string): [string, string] { return a < b ? [a, b] : [b, a] }

async function matchForUser(matchId: string, userId: string) {
  return (await db.select().from(matches).where(and(eq(matches.id, matchId), or(eq(matches.userAId, userId), eq(matches.userBId, userId)))).limit(1))[0] ?? null
}

async function activeProfileRows(userId: string) {
  const viewer = await findUser(userId)
  const targetRole = viewer?.role === 'sugar-daddy' ? 'sugar-baby' : 'sugar-daddy'
  const decisions = await db.select({ targetUserId: swipes.targetUserId }).from(swipes).where(eq(swipes.userId, userId))
  const decidedIds = decisions.map(({ targetUserId }) => targetUserId)
  const filters = [eq(users.status, 'active'), eq(users.role, targetRole), sql`${users.id} <> ${userId}`]
  if (decidedIds.length) filters.push(notInArray(users.id, decidedIds))
  const rows = await db.select().from(users).where(and(...filters)).orderBy(desc(users.createdAt)).limit(100)
  const ready = []
  for (const row of rows) {
    const photoTotal = Number((await db.select({ value: count() }).from(userPhotos).where(eq(userPhotos.userId, row.id)))[0]?.value ?? 0)
    if (photoTotal >= 3) ready.push(row)
  }
  return await Promise.all(ready.map(profileWithPhotos))
}

async function hasThreePhotos(userId: string) {
  return Number((await db.select({ value: count() }).from(userPhotos).where(eq(userPhotos.userId, userId)))[0]?.value ?? 0) >= 3
}

async function register(request: Request) {
  const body = await readJson<RegisterBody>(request)
  const email = emailValue(body.email)
  const password = text(body.password, 'La contraseña', 200)
  if (password.length < 8) throw new Error('Usa una contraseña de al menos 8 caracteres.')
  const role = text(body.role, 'El tipo de perfil')
  if (!allowedRoles.has(role)) throw new Error('El tipo de perfil no es válido.')
  const profileIdentity = body.profileIdentity === undefined
    ? role === 'sugar-daddy' ? 'man' : 'woman'
    : text(body.profileIdentity, 'La identificación del perfil', 32)
  if (!allowedProfileIdentities.has(profileIdentity)) throw new Error('La identificación del perfil no es válida.')
  let age: number
  try {
    age = ageValue(body.age)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'La edad debe estar entre 18 y 99 años.' }, { status: 400 })
  }
  const name = text(body.name, 'El nombre', 120)
  const country = text(body.country, 'El país', 120)
  const city = text(body.city, 'La ciudad', 120)
  const occupation = role === 'sugar-daddy' ? text(body.occupation, 'La ocupación', 160) : optionalText(body.occupation, 160)
  const salary = role === 'sugar-daddy' ? text(body.salary, 'El salario', 120) : optionalText(body.salary, 120)
  const economicActivity = role === 'sugar-daddy' ? text(body.economicActivity, 'La descripción de actividad económica', 500) : optionalText(body.economicActivity, 500)
  if (await findUserByEmail(email)) return json({ error: 'Ese correo ya está registrado. Inicia sesión para continuar.' }, { status: 409 })
  const now = new Date()
  const id = randomUUID()
  const free = role === 'sugar-daddy' && age >= 35
  const status = free ? 'active' : 'pending_payment'
  await db.insert(users).values({ id, email, passwordHash: await hashPassword(password), role, profileIdentity, name, age, country, city, bio: optionalText(body.bio, 600) ?? '', occupation, salary, economicActivity, status, plan: free ? 'free_35_plus' : null, createdAt: now, updatedAt: now, paidAt: free ? now : null })
  const emailHash = registrationEmailHash(email)
  await db.delete(registrationLeads).where(eq(registrationLeads.emailHash, emailHash)).catch(() => undefined)
  const user = await findUser(id)
  if (!user) throw new Error('No se pudo crear el usuario.')
  return new Response(JSON.stringify({ data: { user: await profileWithPhotos(user), requiresPayment: requiresPayment(user), offer: immediateOffer(user) } }), { status: 201, headers: new Headers([...sessionHeaders({ userId: user.id, role: user.role, email: user.email, name: user.name }).entries(), ['content-type', 'application/json; charset=utf-8']]) })
}

async function checkEmail(request: Request) {
  const body = await readJson<{ email?: string }>(request)
  const email = emailValue(body.email)
  const exists = Boolean(await findUserByEmail(email))
  if (!exists) {
    const now = new Date()
    const emailHash = registrationEmailHash(email)
    await db.insert(registrationLeads).values({ emailHash, startedAt: now, lastSeenAt: now }).onConflictDoUpdate({ target: registrationLeads.emailHash, set: { lastSeenAt: now } })
  }
  return json({ data: { available: !exists } })
}

async function login(request: Request, admin = false) {
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = emailValue(body.email)
  const password = text(body.password, 'La contraseña', 200)
  if (admin) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    const adminHash = process.env.ADMIN_PASSWORD_HASH?.trim()
    const adminPassword = process.env.ADMIN_PASSWORD?.trim()
    if (!adminEmail || adminEmail !== email || (!adminHash && !adminPassword)) return json({ error: 'Credenciales de administrador incorrectas.' }, { status: 401 })
    const valid = adminHash ? await verifyPassword(password, adminHash) : password === adminPassword
    if (!valid) return json({ error: 'Credenciales de administrador incorrectas.' }, { status: 401 })
    return new Response(JSON.stringify({ data: { user: adminUser() } }), { headers: new Headers([...sessionHeaders({ userId: 'admin', role: 'admin', email, name: 'Administrador' }).entries(), ['content-type', 'application/json; charset=utf-8']]) })
  }
  const user = await findUserByEmail(email)
  if (!user || !(await verifyPassword(password, user.passwordHash))) return json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 })
  return new Response(JSON.stringify({ data: { user: await profileWithPhotos(user), requiresPayment: requiresPayment(user), offer: immediateOffer(user) } }), { headers: new Headers([...sessionHeaders({ userId: user.id, role: user.role, email: user.email, name: user.name }).entries(), ['content-type', 'application/json; charset=utf-8']]) })
}

async function updateProfile(request: Request) {
  const session = await requireAuth(request)
  if (session.userId === 'admin') return json({ data: adminUser() })
  const current = await findUser(session.userId)
  if (!current) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const body = await readJson<Partial<RegisterBody>>(request)
  const profileIdentity = body.profileIdentity === undefined ? current.profileIdentity : optionalText(body.profileIdentity, 32)
  if (profileIdentity !== null && !allowedProfileIdentities.has(profileIdentity)) return json({ error: 'La identificación del perfil no es válida.' }, { status: 400 })
  await db.update(users).set({ name: body.name === undefined ? current.name : text(body.name, 'El nombre', 120), age: body.age === undefined ? current.age : ageValue(body.age), country: body.country === undefined ? current.country : text(body.country, 'El país', 120), city: body.city === undefined ? current.city : text(body.city, 'La ciudad', 120), bio: body.bio === undefined ? current.bio : optionalText(body.bio, 600) ?? '', occupation: body.occupation === undefined ? current.occupation : optionalText(body.occupation, 160), salary: body.salary === undefined ? current.salary : optionalText(body.salary, 120), economicActivity: body.economicActivity === undefined ? current.economicActivity : optionalText(body.economicActivity, 500), profileIdentity, updatedAt: new Date() }).where(eq(users.id, current.id))
  const updated = await findUser(current.id)
  return json({ data: updated ? await profileWithPhotos(updated) : null })
}

async function replacePhoto(request: Request, positionValue: string) {
  const session = await requireAuth(request)
  if (session.userId === 'admin') return json({ error: 'El administrador no tiene fotos de perfil.' }, { status: 400 })
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const position = Number(positionValue)
  if (!Number.isInteger(position) || position < 0 || position > 2) return json({ error: 'La posición de la foto no es válida.' }, { status: 400 })
  const form = await request.formData()
  const file = form.get('photo')
  if (!(file instanceof File)) return json({ error: 'Selecciona una imagen.' }, { status: 400 })
  const contentType = profileImageContentType(file)
  if (!contentType) return json({ error: 'Solo puedes seleccionar imágenes.' }, { status: 400 })
  const extension = (file.name.includes('.') ? file.name.split('.').at(-1) : contentType.split('/').at(-1))?.replace(/[^a-z0-9]/gi, '') || 'img'
  const key = `profiles/${user.id}/${position}-${randomUUID()}.${extension}`
  let saved: Awaited<ReturnType<typeof storage.upload>> | null = null
  try {
    saved = await storage.upload({ body: await file.arrayBuffer(), fileName: file.name, contentType, visibility: 'public', key, thumbnail: true })
    const oldPhoto = (await db.select().from(userPhotos).where(and(eq(userPhotos.userId, user.id), eq(userPhotos.position, position))).limit(1))[0]
    const now = new Date()
    if (oldPhoto) await db.update(userPhotos).set({ fileKey: saved.key, createdAt: now }).where(eq(userPhotos.id, oldPhoto.id))
    else await db.insert(userPhotos).values({ id: randomUUID(), userId: user.id, fileKey: saved.key, position, createdAt: now })
    if (oldPhoto) await storage.delete(oldPhoto.fileKey).catch(() => undefined)
    return json({ data: { position, url: await storage.getUrl(saved.key) } })
  } catch (error) {
    if (saved) await storage.delete(saved.key).catch(() => undefined)
    console.error('[api] Profile photo replacement failed:', error instanceof Error ? error.message : String(error))
    return json({ error: 'No se pudo actualizar la foto. Inténtalo de nuevo.' }, { status: 422 })
  }
}

async function uploadPhotos(request: Request) {
  const session = await requireAuth(request)
  if (session.userId === 'admin') return json({ error: 'El administrador no tiene fotos de perfil.' }, { status: 400 })
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const form = await request.formData()
  const files = form.getAll('photos').filter((value): value is File => value instanceof File)
  if (files.length !== 3) return json({ error: 'Debes subir exactamente 3 fotos.' }, { status: 400 })
  const contentTypes = files.map(profileImageContentType)
  if (contentTypes.some((contentType) => !contentType)) return json({ error: 'Solo puedes seleccionar imágenes.' }, { status: 400 })
  const uploaded: { position: number; saved: Awaited<ReturnType<typeof storage.upload>> }[] = []
  let photoRowsReplaced = false
  try {
    for (const [position, file] of files.entries()) {
      const extension = (file.name.includes('.') ? file.name.split('.').at(-1) : contentTypes[position]!.split('/').at(-1))?.replace(/[^a-z0-9]/gi, '') || 'img'
      const saved = await storage.upload({ body: await file.arrayBuffer(), fileName: file.name, contentType: contentTypes[position]!, visibility: 'public', key: `profiles/${user.id}/${position}-${randomUUID()}.${extension}`, thumbnail: true })
      uploaded.push({ position, saved })
    }
    const result = await Promise.all(uploaded.map(async ({ position, saved }) => ({ position, url: await storage.getUrl(saved.key) })))
    const oldPhotos = await db.select().from(userPhotos).where(eq(userPhotos.userId, user.id))
    await Promise.all(oldPhotos.map((photo) => storage.delete(photo.fileKey).catch(() => undefined)))
    await db.delete(userPhotos).where(eq(userPhotos.userId, user.id))
    photoRowsReplaced = true
    const now = new Date()
    for (const { position, saved } of uploaded) await db.insert(userPhotos).values({ id: randomUUID(), userId: user.id, fileKey: saved.key, position, createdAt: now })
    return json({ data: result })
  } catch (error) {
    await Promise.all(uploaded.map(({ saved }) => storage.delete(saved.key).catch(() => undefined)))
    if (photoRowsReplaced) await db.delete(userPhotos).where(eq(userPhotos.userId, user.id)).catch(() => undefined)
    console.error('[api] Profile photo upload failed:', error instanceof Error ? error.message : String(error))
    return json({ error: 'No se pudieron guardar las fotos. Inténtalo de nuevo.' }, { status: 422 })
  }
}

async function swipe(request: Request) {
  const session = await requireAuth(request)
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  if (requiresPayment(user) && !isLimitedWoman(user)) return paymentRequiredResponse()
  if (isLimitedWoman(user)) {
    const used = Number((await db.select({ value: count() }).from(swipes).where(eq(swipes.userId, user.id)))[0]?.value ?? 0)
    if (used >= 10) return paymentRequiredResponse()
  }
  const body = await readJson<{ targetUserId?: string; action?: string }>(request)
  const targetUserId = text(body.targetUserId, 'El perfil destino', 80)
  const action = body.action === 'like' || body.action === 'pass' ? body.action : ''
  if (!action) return json({ error: 'La acción debe ser like o pass.' }, { status: 400 })
  const target = await findUser(targetUserId)
  if (!target || !isActive(target)) return json({ error: 'Ese perfil no está disponible.' }, { status: 404 })
  if (target.role === user.role) return json({ error: 'Solo puedes conectar con perfiles del otro tipo.' }, { status: 400 })
  const now = new Date()
  await db.insert(swipes).values({ id: randomUUID(), userId: user.id, targetUserId, action, createdAt: now }).onConflictDoUpdate({ target: [swipes.userId, swipes.targetUserId], set: { action, createdAt: now } })
  let match = null
  if (action === 'like') {
    const reciprocal = (await db.select().from(swipes).where(and(eq(swipes.userId, targetUserId), eq(swipes.targetUserId, user.id), eq(swipes.action, 'like'))).limit(1))[0]
    if (reciprocal) {
      const [userAId, userBId] = orderedPair(user.id, targetUserId)
      const existing = (await db.select().from(matches).where(and(eq(matches.userAId, userAId), eq(matches.userBId, userBId))).limit(1))[0]
      match = existing ?? (await db.insert(matches).values({ id: randomUUID(), userAId, userBId, createdAt: now }).returning())[0]
    }
  }
  return json({ data: { matched: Boolean(match), matchId: match?.id ?? null } })
}

async function listMatches(request: Request) {
  const session = await requireAuth(request)
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  if (requiresPayment(user)) return paymentRequiredResponse()
  const rows = await db.select().from(matches).where(or(eq(matches.userAId, user.id), eq(matches.userBId, user.id))).orderBy(desc(matches.createdAt))
  const result = await Promise.all(rows.map(async (match) => { const otherId = match.userAId === user.id ? match.userBId : match.userAId; const other = await findUser(otherId); return other ? { id: match.id, createdAt: isoDate(match.createdAt), user: await profileWithPhotos(other) } : null }))
  return json({ data: result.filter(Boolean) })
}

async function listMessages(request: Request, matchId: string) {
  const session = await requireAuth(request)
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  if (requiresPayment(user)) return paymentRequiredResponse()
  if (!await matchForUser(matchId, user.id)) return json({ error: 'Match no encontrado.' }, { status: 404 })
  return json({ data: await db.select().from(messages).where(eq(messages.matchId, matchId)).orderBy(asc(messages.createdAt)) })
}

async function sendMessage(request: Request, matchId: string) {
  const session = await requireAuth(request)
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const match = await matchForUser(matchId, user.id)
  if (!match) return json({ error: 'Match no encontrado.' }, { status: 404 })
  const sentCount = Number((await db.select({ value: count() }).from(messages).where(eq(messages.senderId, user.id)))[0]?.value ?? 0)
  if (isLimitedWoman(user) && sentCount >= 1) return paymentRequiredResponse()
  const body = await readJson<{ body?: string }>(request)
  const message = { id: randomUUID(), matchId, senderId: user.id, body: text(body.body, 'El mensaje', 1000), createdAt: new Date() }
  await db.insert(messages).values(message)
  return json({ data: message }, { status: 201 })
}

async function checkout(request: Request) {
  const session = await requireAuth(request)
  const user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  if (isFreeAdultMan(user) || isActive(user)) return json({ data: { active: true, plan: user.plan } })
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const mode = stripeMode()
  const expectedPrefix = mode === 'test' ? 'sk_test_' : mode === 'live' ? 'sk_live_' : ''
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim() || (process.env.NODE_ENV === 'production' ? 'https://sugar-daddy.dibot.co' : 'http://localhost:5173')
  const configurationProblems: string[] = []
  if (!expectedPrefix) configurationProblems.push('STRIPE_MODE debe ser test o live')
  if (!secretKey) configurationProblems.push('STRIPE_SECRET_KEY está vacío')
  else if (expectedPrefix && !secretKey.startsWith(expectedPrefix)) configurationProblems.push('STRIPE_SECRET_KEY no coincide con STRIPE_MODE')
  if (!webhookSecret) configurationProblems.push('STRIPE_WEBHOOK_SECRET está vacío')
  else if (!webhookSecret.startsWith('whsec_')) configurationProblems.push('STRIPE_WEBHOOK_SECRET debe empezar con whsec_')
  let parsedBaseUrl: URL | null = null
  try {
    parsedBaseUrl = new URL(configuredBaseUrl)
  } catch { /* Report the setting name below without exposing any values. */ }
  if (!parsedBaseUrl || !['http:', 'https:'].includes(parsedBaseUrl.protocol) || (process.env.NODE_ENV === 'production' && parsedBaseUrl.protocol !== 'https:')) configurationProblems.push('APP_BASE_URL no es una URL válida para este entorno')
  if (configurationProblems.length) return json({ error: `Stripe no está listo: ${configurationProblems.join('. ')}. Completa .env y reinicia la API.` }, { status: 503 })
  const baseUrl = parsedBaseUrl!.origin

  let stripeSession: Stripe.Checkout.Session
  try {
    const stripe = new Stripe(secretKey!)
    stripeSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      locale: 'es',
      line_items: [{
        price_data: {
          currency: 'mxn',
          unit_amount: launchPriceMxn * 100,
          product_data: { name: 'Membresía Sugar Daddy', description: 'Acceso mensual a conexiones y chat ilimitados.' },
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { appUserId: user.id, appPlan: 'launch_49_mxn' },
      subscription_data: { metadata: { appUserId: user.id, appPlan: 'launch_49_mxn' } },
      success_url: `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?payment=cancelled`,
    })
    if (!stripeSession.url) throw new Error('Stripe no devolvió una URL de Checkout.')
  } catch (error) {
    console.error('[payments] Stripe Checkout creation failed:', error instanceof Error ? error.message : String(error))
    return json({ error: 'No se pudo abrir el checkout de Stripe. Revisa las claves y la configuración de tu cuenta.' }, { status: 502 })
  }

  await db.insert(paymentEvents).values({
    id: randomUUID(),
    userId: user.id,
    provider: 'stripe',
    externalId: stripeSession.id,
    type: 'stripe_checkout_created',
    amountMxn: launchPriceMxn,
    status: 'pending',
    payload: JSON.stringify({ currency: 'mxn', recurring: true, mode }),
    createdAt: new Date(),
  }).onConflictDoNothing()
  return json({ data: { checkoutUrl: stripeSession.url, paymentMethod: 'card', recurring: true, offer: offerResponse() } })
}

async function billingStatus(request: Request) {
  const session = await requireAuth(request)
  let user = await findUser(session.userId)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const findPaidEvent = () => db.select({ id: paymentEvents.id }).from(paymentEvents).where(and(
    eq(paymentEvents.userId, user.id),
    eq(paymentEvents.provider, 'stripe'),
    eq(paymentEvents.status, 'paid'),
  )).limit(1)
  let payment = (await findPaidEvent())[0]

  if (!payment || user.status !== 'active') {
    const requestedSessionId = new URL(request.url).searchParams.get('session_id')
    await reconcilePendingCheckout(user, requestedSessionId)
    user = await findUser(session.userId)
    if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
    payment = (await findPaidEvent())[0]
  }

  return json({ data: { paid: user.status === 'active' && Boolean(payment), status: user.status } })
}

function stripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const mode = stripeMode()
  const expectedPrefix = mode === 'test' ? 'sk_test_' : mode === 'live' ? 'sk_live_' : ''
  if (!expectedPrefix || !secretKey?.startsWith(expectedPrefix)) throw new Error('Stripe key is not configured for the selected mode.')
  return new Stripe(secretKey)
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id
  return null
}

async function reconcilePendingCheckout(user: typeof users.$inferSelect, requestedSessionId: string | null) {
  let stripe: Stripe
  try { stripe = stripeClient() }
  catch { return }

  const filters = [
    eq(paymentEvents.userId, user.id),
    eq(paymentEvents.provider, 'stripe'),
    eq(paymentEvents.type, 'stripe_checkout_created'),
    eq(paymentEvents.status, 'pending'),
  ]
  if (requestedSessionId) filters.push(eq(paymentEvents.externalId, requestedSessionId))
  const attempts = await db.select().from(paymentEvents).where(and(...filters)).orderBy(desc(paymentEvents.createdAt)).limit(requestedSessionId ? 1 : 5)
  const mode = stripeMode()

  for (const attempt of attempts) {
    if (!attempt.externalId || !/^cs_(test|live)_/.test(attempt.externalId)) continue
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(attempt.externalId)
      const references = [checkoutSession.metadata?.appUserId, checkoutSession.client_reference_id].filter((value): value is string => Boolean(value))
      const belongsToUser = references.length > 0 && references.every((value) => value === user.id)
      const paid = belongsToUser
        && checkoutSession.livemode === (mode === 'live')
        && checkoutSession.status === 'complete'
        && checkoutSession.mode === 'subscription'
        && checkoutSession.currency?.toLowerCase() === 'mxn'
        && checkoutSession.amount_total === launchPriceMxn * 100
        && ['paid', 'no_payment_required'].includes(checkoutSession.payment_status)

      if (!paid) continue

      const now = new Date()
      const subscriptionId = stripeId(checkoutSession.subscription)
      const customerId = stripeId(checkoutSession.customer)
      await upsertStripeSubscription(user.id, subscriptionId, customerId, 'active', now)
      await setStripeUserPaid(user.id, true, now)
      await db.update(paymentEvents).set({
        status: 'paid',
        amountMxn: launchPriceMxn,
        payload: JSON.stringify({ currency: 'mxn', recurring: true, reconciledBy: 'checkout_session', subscriptionId, customerId }),
      }).where(eq(paymentEvents.id, attempt.id))
      return
    } catch {
      // Webhook processing remains authoritative if Stripe's API is temporarily unavailable.
      return
    }
  }
}

async function findStripeSubscription(subscriptionId: string) {
  return (await db.select().from(subscriptions).where(and(eq(subscriptions.provider, 'stripe'), eq(subscriptions.providerSubscriptionId, subscriptionId))).limit(1))[0] ?? null
}

async function upsertStripeSubscription(userId: string, subscriptionId: string | null, customerId: string | null, status: string, now: Date, nextBillingAt: Date | null = null) {
  if (!subscriptionId) return
  const existing = await findStripeSubscription(subscriptionId)
  const fields = { providerCustomerId: customerId, plan: 'launch_49_mxn', priceMxn: launchPriceMxn, status, nextBillingAt, updatedAt: now }
  if (existing) await db.update(subscriptions).set(fields).where(eq(subscriptions.id, existing.id))
  else await db.insert(subscriptions).values({ id: randomUUID(), userId, provider: 'stripe', providerSubscriptionId: subscriptionId, ...fields, createdAt: now })
}

async function setStripeUserPaid(userId: string, paid: boolean, now: Date) {
  const user = await findUser(userId)
  if (!user || isFreeAdultMan(user)) return
  await db.update(users).set(paid
    ? { status: 'active', plan: 'launch_49_mxn', paidAt: now, updatedAt: now }
    : { status: 'pending_payment', updatedAt: now },
  ).where(eq(users.id, userId))
}

async function stripeWebhook(request: Request) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const signature = request.headers.get('stripe-signature')
  if (!endpointSecret?.startsWith('whsec_') || !process.env.STRIPE_SECRET_KEY?.trim()) return json({ error: 'Configura STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET.' }, { status: 503 })
  if (!signature) return json({ error: 'Falta la firma Stripe-Signature.' }, { status: 400 })

  let stripe: Stripe
  try { stripe = stripeClient() }
  catch { return json({ error: 'La clave Stripe no coincide con STRIPE_MODE.' }, { status: 503 }) }
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(Buffer.from(await request.arrayBuffer()), signature, endpointSecret)
  } catch {
    return json({ error: 'Firma de Stripe inválida.' }, { status: 400 })
  }
  const mode = stripeMode()
  if (event.livemode !== (mode === 'live')) return json({ error: 'El evento recibido no corresponde al modo de Stripe configurado.' }, { status: 400 })

  const supportedEvents = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ])
  if (!supportedEvents.has(event.type)) return json({ received: true })
  const duplicate = (await db.select({ id: paymentEvents.id }).from(paymentEvents).where(and(eq(paymentEvents.provider, 'stripe'), eq(paymentEvents.externalId, event.id))).limit(1))[0]
  if (duplicate) return json({ received: true, duplicate: true })

  const now = new Date(event.created * 1000)
  let userId: string | null
  let subscriptionId: string | null
  let customerId: string | null
  let amountMxn: number | null
  let status: string

  if (event.type.startsWith('checkout.session.')) {
    const checkoutSession = event.data.object as Stripe.Checkout.Session
    userId = checkoutSession.metadata?.appUserId ?? checkoutSession.client_reference_id
    subscriptionId = stripeId(checkoutSession.subscription)
    customerId = stripeId(checkoutSession.customer)
    amountMxn = checkoutSession.amount_total == null ? null : Math.round(checkoutSession.amount_total / 100)
    const paid = checkoutSession.mode === 'subscription'
      && checkoutSession.currency?.toLowerCase() === 'mxn'
      && checkoutSession.amount_total === launchPriceMxn * 100
      && ['paid', 'no_payment_required'].includes(checkoutSession.payment_status)
      && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
    status = paid ? 'paid' : event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending'
    if (userId && await findUser(userId)) {
      await upsertStripeSubscription(userId, subscriptionId, customerId, paid ? 'active' : 'incomplete', now)
      if (paid) await setStripeUserPaid(userId, true, now)
    } else {
      status = 'orphaned'
      userId = null
    }
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const invoiceData = invoice as unknown as {
      subscription?: string | { id: string } | null
      parent?: { subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> | null } | null }
    }
    subscriptionId = stripeId(invoiceData.subscription ?? invoiceData.parent?.subscription_details?.subscription)
    const mappedSubscription = subscriptionId ? await findStripeSubscription(subscriptionId) : null
    userId = invoiceData.parent?.subscription_details?.metadata?.appUserId ?? mappedSubscription?.userId ?? null
    customerId = stripeId(invoice.customer)
    amountMxn = Math.round((event.type === 'invoice.paid' ? invoice.amount_paid : invoice.amount_due) / 100)
    const user = userId ? await findUser(userId) : null
    if (user && subscriptionId) {
      const paid = event.type === 'invoice.paid' && invoice.currency?.toLowerCase() === 'mxn' && invoice.amount_paid === launchPriceMxn * 100
      status = paid ? 'paid' : event.type === 'invoice.payment_failed' ? 'failed' : 'unverified'
      await upsertStripeSubscription(user.id, subscriptionId, customerId, paid ? 'active' : 'past_due', now)
      await setStripeUserPaid(user.id, paid, now)
    } else {
      status = 'orphaned'
      userId = null
    }
  } else {
    const subscription = event.data.object as Stripe.Subscription
    subscriptionId = subscription.id
    customerId = stripeId(subscription.customer)
    amountMxn = null
    const mappedSubscription = await findStripeSubscription(subscriptionId)
    userId = subscription.metadata?.appUserId ?? mappedSubscription?.userId ?? null
    const user = userId ? await findUser(userId) : null
    if (user) {
      const canceled = event.type === 'customer.subscription.deleted' || subscription.status === 'canceled'
      status = canceled ? 'canceled' : `subscription_${subscription.status}`
      await upsertStripeSubscription(user.id, subscriptionId, customerId, canceled ? 'canceled' : subscription.status, now)
      if (canceled || ['past_due', 'unpaid', 'incomplete_expired'].includes(subscription.status)) await setStripeUserPaid(user.id, false, now)
    } else {
      status = 'orphaned'
      userId = null
    }
  }

  await db.insert(paymentEvents).values({
    id: randomUUID(),
    userId,
    provider: 'stripe',
    externalId: event.id,
    type: event.type,
    amountMxn,
    status,
    payload: JSON.stringify({ objectId: subscriptionId ?? customerId, subscriptionId, customerId }),
    createdAt: now,
  }).onConflictDoNothing()
  return json({ received: true })
}

async function adminOverview(request: Request) {
  await requireRole(request, 'admin')
  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const abandonedBefore = new Date(Date.now() - registrationAbandonmentMs)
  const paidStatuses = ['paid', 'active', 'succeeded', 'approved']
  const [unregistered, activePaid, pending, activeChats, activeSupport] = await Promise.all([
    db.select({ value: count() }).from(registrationLeads).where(lt(registrationLeads.lastSeenAt, abandonedBefore)),
    db.select({ value: sql<number>`count(distinct ${users.id})` }).from(users).innerJoin(paymentEvents, eq(paymentEvents.userId, users.id)).where(and(eq(users.status, 'active'), inArray(paymentEvents.status, paidStatuses))),
    db.select({ value: count() }).from(users).where(eq(users.status, 'pending_payment')),
    db.select({ value: sql<number>`count(distinct ${messages.matchId})` }).from(messages).where(gt(messages.createdAt, activeSince)),
    db.select({ value: sql<number>`count(distinct ${supportMessages.userId})` }).from(supportMessages).where(gt(supportMessages.createdAt, activeSince)),
  ])
  return json({ data: { unregistered: Number(unregistered[0]?.value ?? 0), active: Number(activePaid[0]?.value ?? 0), pendingPayment: Number(pending[0]?.value ?? 0), conversationsActive: Number(activeChats[0]?.value ?? 0) + Number(activeSupport[0]?.value ?? 0), launchPriceMxn, regularPriceMxn } })
}

async function adminUsers(request: Request) {
  await requireRole(request, 'admin')
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  const rows = query ? await db.select().from(users).where(or(sql`${users.name} like ${`%${query}%`}`, sql`${users.email} like ${`%${query}%`}`)).orderBy(desc(users.createdAt)).limit(100) : await db.select().from(users).orderBy(desc(users.createdAt)).limit(100)
  if (!rows.length) return json({ data: [] })
  const userIds = rows.map((user) => user.id)
  const [photoRows, paidEvents] = await Promise.all([
    db.select().from(userPhotos).where(inArray(userPhotos.userId, userIds)).orderBy(asc(userPhotos.position)),
    db.select({ userId: paymentEvents.userId }).from(paymentEvents).where(and(inArray(paymentEvents.userId, userIds), inArray(paymentEvents.status, ['paid', 'active', 'succeeded', 'approved']))),
  ])
  const firstPhotoByUser = new Map<string, (typeof photoRows)[number]>()
  for (const photo of photoRows) if (!firstPhotoByUser.has(photo.userId)) firstPhotoByUser.set(photo.userId, photo)
  const paidUserIds = new Set(paidEvents.map((event) => event.userId).filter((userId): userId is string => Boolean(userId)))
  const data = await Promise.all(rows.map(async (user) => {
    const photo = firstPhotoByUser.get(user.id)
    return { ...publicUser(user), paid: user.status === 'active' && paidUserIds.has(user.id), photos: photo ? [{ id: photo.id, position: photo.position, url: await photoUrl(photo.fileKey) }] : [] }
  }))
  return json({ data })
}

async function adminUpdateUser(request: Request, id: string) {
  await requireRole(request, 'admin')
  const user = await findUser(id)
  if (!user) return json({ error: 'Usuario no encontrado.' }, { status: 404 })
  const body = await readJson<{ status?: string; plan?: string }>(request)
  const status = body.status && ['active', 'pending_payment', 'suspended'].includes(body.status) ? body.status : user.status
  await db.update(users).set({ status, plan: body.plan?.trim() || user.plan, updatedAt: new Date(), paidAt: status === 'active' ? user.paidAt ?? new Date() : user.paidAt }).where(eq(users.id, id))
  const updated = await findUser(id)
  return json({ data: updated ? publicUser(updated) : null })
}

async function supportList(request: Request, userId: string) {
  const session = await requireAuth(request)
  if (session.role !== 'admin' && session.userId !== userId) return json({ error: 'No tienes permisos.' }, { status: 403 })
  return json({ data: await db.select().from(supportMessages).where(eq(supportMessages.userId, userId)).orderBy(asc(supportMessages.createdAt)) })
}

async function supportSend(request: Request, userId: string) {
  const session = await requireAuth(request)
  if (session.role !== 'admin' && session.userId !== userId) return json({ error: 'No tienes permisos.' }, { status: 403 })
  const body = await readJson<{ body?: string }>(request)
  const message = { id: randomUUID(), userId, senderRole: session.role === 'admin' ? 'admin' : 'user', body: text(body.body, 'El mensaje', 1000), createdAt: new Date() }
  await db.insert(supportMessages).values(message)
  return json({ data: message }, { status: 201 })
}

async function health() {
  const metaPromise = db.select().from(appMeta).orderBy(desc(appMeta.updatedAt)).limit(1)
  const schemaCheckPromise = Promise.all([
    db.select().from(users).limit(1),
    db.select().from(registrationLeads).limit(1),
  ])
  const [metaRows] = await Promise.all([metaPromise, schemaCheckPromise])
  const meta = metaRows[0]
  return json({ ok: true, database: true, appName: meta?.appName || process.env.DIBOT_APP_NAME || 'Sugar Daddy' })
}

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  try {
    if (url.pathname.startsWith('/api/storage/')) return await handleStorageRequest(request)
    if (request.method === 'GET' && url.pathname === '/api/health') return await health()
    if (request.method === 'GET' && url.pathname === '/api/meta') return json({ data: (await db.select().from(appMeta).orderBy(desc(appMeta.updatedAt)).limit(1))[0] ?? null })
    if (request.method === 'POST' && url.pathname === '/api/auth/check-email') return await checkEmail(request)
    if (request.method === 'POST' && url.pathname === '/api/auth/register') return await register(request)
    if (request.method === 'POST' && url.pathname === '/api/auth/login') return await login(request)
    if (request.method === 'POST' && url.pathname === '/api/auth/admin/login') return await login(request, true)
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') return new Response(JSON.stringify({ ok: true }), { headers: new Headers([...clearSessionHeaders().entries(), ['content-type', 'application/json; charset=utf-8']]) })
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const session = await getCurrentUser(request)
      if (!session) return json({ data: null })
      if (session.userId === 'admin') return json({ data: { user: adminUser() } }, { headers: sessionHeaders(session) })
      const user = await findUser(session.userId)
      return user ? json({ data: { user: await profileWithPhotos(user), requiresPayment: requiresPayment(user), offer: immediateOffer(user) } }, { headers: sessionHeaders(session) }) : json({ data: null }, { headers: clearSessionHeaders() })
    }
    if (request.method === 'GET' && url.pathname === '/api/profile') { const user = await currentDbUser(request); return user ? json({ data: await profileWithPhotos(user) }) : json({ error: 'Autenticación requerida.' }, { status: 401 }) }
    if (request.method === 'PATCH' && url.pathname === '/api/profile') return await updateProfile(request)
    const profilePhotoPath = url.pathname.match(/^\/api\/profile\/photos\/(\d+)$/)
    if (profilePhotoPath && request.method === 'POST') return await replacePhoto(request, profilePhotoPath[1])
    if (request.method === 'POST' && url.pathname === '/api/profile/photos') return await uploadPhotos(request)
    if (request.method === 'GET' && url.pathname === '/api/discover') { const user = await currentDbUser(request); if (!user) return json({ error: 'Autenticación requerida.' }, { status: 401 }); if (!await hasThreePhotos(user.id)) return json({ error: 'PROFILE_INCOMPLETE', message: 'Sube tus 3 fotos para comenzar.' }, { status: 400 }); if (requiresPayment(user) && !isLimitedWoman(user)) return paymentRequiredResponse(); return json({ data: await activeProfileRows(user.id) }) }
    if (request.method === 'POST' && url.pathname === '/api/swipes') return await swipe(request)
    if (request.method === 'GET' && url.pathname === '/api/matches') return await listMatches(request)
    const matchMessages = url.pathname.match(/^\/api\/matches\/([^/]+)\/messages$/)
    if (matchMessages && request.method === 'GET') return await listMessages(request, matchMessages[1])
    if (matchMessages && request.method === 'POST') return await sendMessage(request, matchMessages[1])
    if (request.method === 'GET' && url.pathname === '/api/billing/status') return await billingStatus(request)
    if (request.method === 'POST' && url.pathname === '/api/billing/checkout') return await checkout(request)
    if (request.method === 'POST' && url.pathname === '/api/webhooks/stripe') return await stripeWebhook(request)
    if (request.method === 'GET' && url.pathname === '/api/admin/overview') return await adminOverview(request)
    if (request.method === 'POST' && url.pathname === '/api/admin/notifications/run') { await requireRole(request, 'admin'); return json({ data: await runWeeklyNotifications() }) }
    if (request.method === 'GET' && url.pathname === '/api/admin/users') return await adminUsers(request)
    const adminUserPath = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
    if (adminUserPath && request.method === 'PATCH') return await adminUpdateUser(request, adminUserPath[1])
    const adminSupportPath = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/messages$/)
    if (adminSupportPath && request.method === 'GET') return await supportList(request, adminSupportPath[1])
    if (adminSupportPath && request.method === 'POST') return await supportSend(request, adminSupportPath[1])
    const supportPath = url.pathname.match(/^\/api\/support\/([^/]+)\/messages$/)
    if (supportPath && request.method === 'GET') return await supportList(request, supportPath[1])
    if (supportPath && request.method === 'POST') return await supportSend(request, supportPath[1])
    return json({ error: 'Ruta no encontrada.' }, { status: 404 })
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof Error && /obligatorio|válido|largo|contraseña|edad|imagen|exactamente/.test(error.message)) return json({ error: error.message }, { status: 400 })
    console.error('[api] Request failed:', error instanceof Error ? error.message : String(error))
    return json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}

startApiServer(handler)
