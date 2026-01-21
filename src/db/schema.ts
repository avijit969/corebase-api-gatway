import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
    id: text('id').primaryKey(), // user_...
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').default('authenticated'),
    status: text('status').default('active'),
    avatar: text('avatar').default(''),
    name: text('name').default(''),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
})

export const projects = sqliteTable('projects', {
    id: text('id').primaryKey(), // proj_...
    ownerId: text('owner_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    status: text('status').default('active'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
})

export const apiKeys = sqliteTable('api_keys', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id),
    key: text('key').notNull().unique(), // pk_...
    name: text('name').default('Default Key'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
})
