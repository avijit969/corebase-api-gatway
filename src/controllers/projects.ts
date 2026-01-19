import { Context } from 'hono'
import { Database } from 'bun:sqlite'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getPlatformDb } from '../db/platform'
import { projects, apiKeys } from '../db/schema'

export const createProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    // 1. Authorization check (Platform level) - For now allow any authenticated user
    const user = c.get('user')
    if (!user) {
        throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED')
    }

    const body = await c.req.json()
    const { name } = body

    if (!name) {
        throw new ApiError('Project name is required', 400, 'INVALID_INPUT')
    }

    // 2. Generate Project ID
    const projectId = 'proj_' + crypto.randomUUID().slice(0, 12)

    try {
        const platformDb = getPlatformDb()

        // Insert Project
        await platformDb.insert(projects).values({
            id: projectId,
            ownerId: user.id,
            name: name
        })

        // Generate API Key
        const key = 'pk_' + crypto.randomUUID().replace(/-/g, '') + '_' + projectId.slice(5)
        await platformDb.insert(apiKeys).values({
            projectId: projectId,
            key: key,
            name: 'Default Key'
        })


        // 3. Creating SQLite Database for the project
        const dbsDir = path.resolve(process.cwd(), 'dbs')

        if (!fs.existsSync(dbsDir)) {
            try {
                fs.mkdirSync(dbsDir, { recursive: true })
            } catch (e) {
                console.error('Failed to create dbs dir:', e)
            }
        }

        const dbPath = path.join(dbsDir, `${projectId}.sqlite`)
        const db = new Database(dbPath, { create: true })

        // Initialize Meta Table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS _meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `).run()

        // Initialize Project Auth Users Table (SQLite)
        db.prepare(`
            CREATE TABLE IF NOT EXISTS auth_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                role TEXT DEFAULT 'user',
                metadata TEXT
            );
        `).run()

        const insertMeta = db.prepare('INSERT INTO _meta (key, value) VALUES ($key, $value)')

        insertMeta.run({
            $key: 'name',
            $value: name
        })

        insertMeta.run({
            $key: 'created_at',
            $value: new Date().toISOString()
        })

        insertMeta.run({
            $key: 'owner_id',
            $value: user.id
        })

        db.close()

        return sendResponse(c, {
            id: projectId,
            name,
            api_key: key,
            message: 'Project created and database created'
        }, 201)

    } catch (error) {
        console.error('Project creation failed:', error)
        throw new ApiError('Failed to provision project resources', 500, 'INTERNAL_ERROR')
    }
}

export const getProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const id = c.req.param('id')
    const dbPath = path.resolve(process.cwd(), 'dbs', `${id}.sqlite`)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project not found', 404, 'NOT_FOUND')
    }

    const db = new Database(dbPath)
    const meta = db.prepare('SELECT * FROM _meta').all().reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row?.value
        return acc
    }, {} as Record<string, string>)
    db.close()
    return sendResponse(c, {
        id,
        status: 'active',
        meta
    })
}
