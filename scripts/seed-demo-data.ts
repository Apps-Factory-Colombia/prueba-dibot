import { and, asc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { hashPassword } from '../api/auth/password.ts'
import { db } from '../api/db/client.ts'
import { matches, messages, swipes, userPhotos, users } from '../api/db/schema.ts'
import { storage } from '../api/storage/index.ts'

type DemoProfile = {
  id: string
  email: string
  role: 'sugar-daddy' | 'sugar-baby'
  name: string
  age: number
  city: string
  bio: string
  occupation?: string
  salary?: string
  economicActivity?: string
  plan: string
  photos: string[]
}

function requireDemoPassword(): string {
  const password = process.env.DEMO_SEED_PASSWORD?.trim()
  if (!password || password.length < 12) {
    throw new Error('Define DEMO_SEED_PASSWORD con al menos 12 caracteres antes de crear perfiles de prueba.')
  }
  return password
}
const demoPassword = requireDemoPassword()
if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED_ALLOW_PRODUCTION !== '1') {
  throw new Error('La carga de perfiles demo está bloqueada en producción. Usa staging o habilítala explícitamente si ya aprobaste ese cambio de datos.')
}
const now = new Date()

const demoProfiles: DemoProfile[] = [
  { id: 'd0000000-0000-4000-8000-000000000001', email: 'alejandro.demo@example.com', role: 'sugar-daddy', name: 'Alejandro Ruiz', age: 42, city: 'Ciudad de México', bio: 'Empresario, viajero y amante de las buenas conversaciones.', occupation: 'Empresario', salary: '$120,000 MXN', economicActivity: 'Inversiones y negocios de tecnología.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000002', email: 'ricardo.demo@example.com', role: 'sugar-daddy', name: 'Ricardo Mendoza', age: 51, city: 'Monterrey', bio: 'Me gusta compartir experiencias, conocer lugares y apoyar proyectos.', occupation: 'Director financiero', salary: '$180,000 MXN', economicActivity: 'Consultoría financiera e inversiones.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000003', email: 'mateo.demo@example.com', role: 'sugar-daddy', name: 'Mateo Salazar', age: 36, city: 'Guadalajara', bio: 'Tecnología, gastronomía y planes espontáneos.', occupation: 'Fundador de startup', salary: '$95,000 MXN', economicActivity: 'Desarrollo de software y comercio digital.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000004', email: 'daniel.demo@example.com', role: 'sugar-daddy', name: 'Daniel Torres', age: 29, city: 'Cancún', bio: 'Vivo cerca del mar y disfruto viajar con buena compañía.', occupation: 'Director de marketing', salary: '$72,000 MXN', economicActivity: 'Marketing turístico y experiencias de viaje.', plan: 'test_launch_49_mxn', photos: ['https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000005', email: 'valentina.demo@example.com', role: 'sugar-baby', name: 'Valentina Herrera', age: 27, city: 'Ciudad de México', bio: 'Creativa, curiosa y siempre lista para descubrir algo nuevo.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000006', email: 'sofia.demo@example.com', role: 'sugar-baby', name: 'Sofía Ramírez', age: 31, city: 'Puebla', bio: 'Disfruto el arte, los viajes y las conexiones auténticas.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000007', email: 'lucas.demo@example.com', role: 'sugar-daddy', name: 'Lucas Navarro', age: 39, city: 'Querétaro', bio: 'Me apasionan los viajes, el vino y las conversaciones que dejan algo.', occupation: 'Director comercial', salary: '$110,000 MXN', economicActivity: 'Comercio internacional y consultoría.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000008', email: 'sebastian.demo@example.com', role: 'sugar-daddy', name: 'Sebastián León', age: 34, city: 'Mérida', bio: 'Arquitectura, música y escapadas de fin de semana.', occupation: 'Arquitecto', salary: '$88,000 MXN', economicActivity: 'Diseño y desarrollo inmobiliario.', plan: 'test_launch_49_mxn', photos: ['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000009', email: 'andres.demo@example.com', role: 'sugar-daddy', name: 'Andrés Castillo', age: 47, city: 'León', bio: 'Disfruto crear experiencias y compartir buenos momentos.', occupation: 'Empresario', salary: '$155,000 MXN', economicActivity: 'Manufactura y negocios familiares.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000010', email: 'jorge.demo@example.com', role: 'sugar-daddy', name: 'Jorge Villalba', age: 43, city: 'Tijuana', bio: 'Tecnología, cocina y una buena playlist para cada ocasión.', occupation: 'Inversionista', salary: '$132,000 MXN', economicActivity: 'Tecnología y capital privado.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000011', email: 'emiliano.demo@example.com', role: 'sugar-daddy', name: 'Emiliano Cruz', age: 32, city: 'Oaxaca', bio: 'Viajar ligero, comer rico y conocer personas interesantes.', occupation: 'Chef ejecutivo', salary: '$76,000 MXN', economicActivity: 'Restaurantes y experiencias gastronómicas.', plan: 'test_launch_49_mxn', photos: ['https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000012', email: 'roberto.demo@example.com', role: 'sugar-daddy', name: 'Roberto Fuentes', age: 55, city: 'Puebla', bio: 'Arte, bienestar y planes tranquilos con excelente compañía.', occupation: 'Consultor', salary: '$165,000 MXN', economicActivity: 'Consultoría estratégica.', plan: 'free_35_plus', photos: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000013', email: 'camila.demo@example.com', role: 'sugar-baby', name: 'Camila Ortega', age: 26, city: 'Guadalajara', bio: 'Diseñadora, curiosa y fan de los viajes con propósito.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000014', email: 'renata.demo@example.com', role: 'sugar-baby', name: 'Renata Silva', age: 30, city: 'Monterrey', bio: 'Me encantan la moda, la fotografía y descubrir restaurantes.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000015', email: 'isabela.demo@example.com', role: 'sugar-baby', name: 'Isabela Torres', age: 28, city: 'Cancún', bio: 'Playa, arte y una conexión que se sienta genuina.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000016', email: 'natalia.demo@example.com', role: 'sugar-baby', name: 'Natalia Gómez', age: 33, city: 'Mérida', bio: 'Amo la música en vivo, los libros y los viajes espontáneos.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000017', email: 'paula.demo@example.com', role: 'sugar-baby', name: 'Paula Mendoza', age: 25, city: 'Querétaro', bio: 'Emprendedora, alegre y siempre lista para una nueva aventura.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=82'] },
  { id: 'd0000000-0000-4000-8000-000000000018', email: 'elena.demo@example.com', role: 'sugar-baby', name: 'Elena Ríos', age: 35, city: 'Tijuana', bio: 'Cultura, bienestar y conexiones con intención.', plan: 'community_demo', photos: ['https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=82', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=82'] },
]

async function ensureUser(profile: DemoProfile) {
  const existing = (await db.select().from(users).where(eq(users.email, profile.email)).limit(1))[0]
  if (existing) {
    await db.update(users).set({ role: profile.role, profileIdentity: profile.role === 'sugar-daddy' ? 'man' : 'woman', name: profile.name, age: profile.age, city: profile.city, bio: profile.bio, occupation: profile.occupation ?? null, salary: profile.salary ?? null, economicActivity: profile.economicActivity ?? null, status: 'active', plan: profile.plan, paidAt: now, updatedAt: now }).where(eq(users.id, existing.id))
    return (await db.select().from(users).where(eq(users.id, existing.id)).limit(1))[0]!
  }
  const passwordHash = await hashPassword(demoPassword)
  await db.insert(users).values({ id: profile.id, email: profile.email, passwordHash, role: profile.role, profileIdentity: profile.role === 'sugar-daddy' ? 'man' : 'woman', name: profile.name, age: profile.age, city: profile.city, bio: profile.bio, occupation: profile.occupation ?? null, salary: profile.salary ?? null, economicActivity: profile.economicActivity ?? null, status: 'active', plan: profile.plan, createdAt: now, updatedAt: now, paidAt: now })
  return (await db.select().from(users).where(eq(users.id, profile.id)).limit(1))[0]!
}

async function ensurePhotos(user: typeof users.$inferSelect, sourceUrls: string[]) {
  const current = await db.select().from(userPhotos).where(eq(userPhotos.userId, user.id)).orderBy(asc(userPhotos.position))
  const alreadyMigrated = current.length === sourceUrls.length && current.every((photo, index) => photo.fileKey === sourceUrls[index])
  if (alreadyMigrated) return
  await Promise.all(current.filter((photo) => !/^https?:\/\//i.test(photo.fileKey)).map((photo) => storage.delete(photo.fileKey).catch(() => undefined)))
  await db.delete(userPhotos).where(eq(userPhotos.userId, user.id))
  for (const [position, fileKey] of sourceUrls.entries()) {
    await db.insert(userPhotos).values({ id: randomUUID(), userId: user.id, fileKey, position, createdAt: now })
  }
}

function orderedPair(a: string, b: string): [string, string] { return a < b ? [a, b] : [b, a] }

async function ensureMatch(userAId: string, userBId: string) {
  const [userA, userB] = orderedPair(userAId, userBId)
  const createdAt = new Date(now.getTime() - 1000 * 60 * 45)
  await db.insert(swipes).values({ id: randomUUID(), userId: userAId, targetUserId: userBId, action: 'like', createdAt }).onConflictDoUpdate({ target: [swipes.userId, swipes.targetUserId], set: { action: 'like', createdAt } })
  await db.insert(swipes).values({ id: randomUUID(), userId: userBId, targetUserId: userAId, action: 'like', createdAt }).onConflictDoUpdate({ target: [swipes.userId, swipes.targetUserId], set: { action: 'like', createdAt } })
  let match = (await db.select().from(matches).where(and(eq(matches.userAId, userA), eq(matches.userBId, userB))).limit(1))[0]
  if (!match) match = (await db.insert(matches).values({ id: randomUUID(), userAId: userA, userBId: userB, createdAt }).returning())[0]
  return match!
}

const seeded = []
for (const profile of demoProfiles) {
  const user = await ensureUser(profile)
  await ensurePhotos(user, profile.photos)
  seeded.push(user)
}

await db.delete(messages).where(sql`${messages.id} like 'demo-message-%'`)
const currentViewer = (await db.select().from(users).where(eq(users.email, 'qa-onboarding@example.com')).limit(1))[0] ?? seeded.find((user) => user.role === 'sugar-baby')!
const demoMen = seeded.filter((user) => user.role === 'sugar-daddy')
const firstMatch = await ensureMatch(currentViewer.id, demoMen[0]!.id)
await ensureMatch(currentViewer.id, demoMen[1]!.id)

console.log(`[seed-demo] ${seeded.length} perfiles demo activos, 3 fotos por perfil y matches listos; no se insertaron mensajes.`)
const demoLogin = seeded.find((user) => user.email === 'valentina.demo@example.com')!
console.log(`[seed-demo] Login demo: ${demoLogin.email}; contraseña configurada desde DEMO_SEED_PASSWORD.`)
console.log(`[seed-demo] Match principal: ${firstMatch.id}`)
