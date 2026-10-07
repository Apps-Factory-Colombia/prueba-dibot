import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { matches, notificationLogs, users } from './db/schema.js'
import { db } from './db/client.js'

const phrases = ['Y tú ya tienes un novio millonario', 'Recibe regalos y viajes', 'Primera aplicación en Latinoamérica en Español', 'Chatea, diviértete y haz dinero']

function weekKey() {
  const date = new Date()
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - first.getTime()) / 86400000) + first.getUTCDay() + 1) / 7)
  return `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`
}

async function sendEmail(to: string, subject: string, text: string) {
  const endpoint = process.env.EMAIL_API_URL?.trim()
  const apiKey = process.env.EMAIL_API_KEY?.trim()
  if (!endpoint || !apiKey) return false
  const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ to, subject, text }) })
  return response.ok
}

export async function runWeeklyNotifications() {
  const key = weekKey()
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt))
  const allMatches = await db.select().from(matches)
  const matchedIds = new Set(allMatches.flatMap((match) => [match.userAId, match.userBId]))
  const activeUsers = allUsers.filter((user) => user.status === 'active' && matchedIds.has(user.id))
  const unpaidUsers = allUsers.filter((user) => user.status === 'pending_payment')
  let sent = 0
  let skipped = 0
  for (const user of [...activeUsers, ...unpaidUsers]) {
    const kind = activeUsers.includes(user) ? 'weekly_match' : 'weekly_offer'
    const exists = (await db.select().from(notificationLogs).where(and(eq(notificationLogs.userId, user.id), eq(notificationLogs.kind, kind), eq(notificationLogs.weekKey, key))).limit(1))[0]
    if (exists) { skipped += 1; continue }
    const subject = kind === 'weekly_match' ? 'Tienes nuevas conexiones en Sugar Daddy' : 'Conoce Sugar Daddy y conecta sin límites'
    const body = kind === 'weekly_match' ? 'Tienes un nuevo match. Entra a Sugar Daddy para descubrir quién quiere conocerte.' : phrases.join('\n')
    const ok = await sendEmail(user.email, subject, body)
    await db.insert(notificationLogs).values({ id: randomUUID(), userId: user.id, kind, weekKey: key, status: ok ? 'sent' : 'not_configured', sentAt: new Date() })
    if (ok) sent += 1
  }
  return { weekKey: key, sent, skipped, candidates: activeUsers.length + unpaidUsers.length, configured: Boolean(process.env.EMAIL_API_URL?.trim() && process.env.EMAIL_API_KEY?.trim()) }
}
