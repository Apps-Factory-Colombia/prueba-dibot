import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Stable infrastructure row. dibot-fast extends this schema with the
 * product-specific entities inferred from the user's prompt; this row keeps
 * the base API, seed and health check runnable before that extension.
 */
export const appMeta = sqliteTable('app_meta', {
  id: text('id').primaryKey(),
  appName: text('app_name').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const registrationLeads = sqliteTable('registration_leads', {
  emailHash: text('email_hash').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  profileIdentity: text('profile_identity'),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  country: text('country').notNull().default(''),
  city: text('city').notNull(),
  bio: text('bio').notNull(),
  occupation: text('occupation'),
  salary: text('salary'),
  economicActivity: text('economic_activity'),
  status: text('status').notNull().default('pending_payment'),
  plan: text('plan'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
}, (table) => ({
  emailUnique: uniqueIndex('users_email_unique').on(table.email),
  roleIndex: index('users_role_idx').on(table.role),
  statusIndex: index('users_status_idx').on(table.status),
}))

export const userPhotos = sqliteTable('user_photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  fileKey: text('file_key').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  userPositionUnique: uniqueIndex('user_photos_user_position_unique').on(table.userId, table.position),
  userIndex: index('user_photos_user_idx').on(table.userId),
}))

export const swipes = sqliteTable('swipes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  targetUserId: text('target_user_id').notNull(),
  action: text('action').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  swipeUnique: uniqueIndex('swipes_user_target_unique').on(table.userId, table.targetUserId),
  userIndex: index('swipes_user_idx').on(table.userId),
}))

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  userAId: text('user_a_id').notNull(),
  userBId: text('user_b_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  pairUnique: uniqueIndex('matches_pair_unique').on(table.userAId, table.userBId),
  userAIndex: index('matches_user_a_idx').on(table.userAId),
  userBIndex: index('matches_user_b_idx').on(table.userBId),
}))

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  senderId: text('sender_id').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  matchIndex: index('messages_match_idx').on(table.matchId, table.createdAt),
}))

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  plan: text('plan').notNull(),
  priceMxn: integer('price_mxn').notNull(),
  status: text('status').notNull(),
  nextBillingAt: integer('next_billing_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  userIndex: index('subscriptions_user_idx').on(table.userId),
  providerIndex: index('subscriptions_provider_idx').on(table.providerSubscriptionId),
}))

export const paymentEvents = sqliteTable('payment_events', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  provider: text('provider').notNull(),
  externalId: text('external_id'),
  type: text('type').notNull(),
  amountMxn: integer('amount_mxn'),
  status: text('status').notNull(),
  payload: text('payload'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  externalUnique: uniqueIndex('payment_events_external_unique').on(table.provider, table.externalId),
  userIndex: index('payment_events_user_idx').on(table.userId),
}))

export const notificationLogs = sqliteTable('notification_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  weekKey: text('week_key').notNull(),
  status: text('status').notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  dedupeUnique: uniqueIndex('notification_logs_dedupe_unique').on(table.userId, table.kind, table.weekKey),
}))

export const supportMessages = sqliteTable('support_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  senderRole: text('sender_role').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  userIndex: index('support_messages_user_idx').on(table.userId, table.createdAt),
}))
