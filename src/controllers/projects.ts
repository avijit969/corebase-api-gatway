import { Context } from 'hono'
import { Database } from 'bun:sqlite'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getPlatformDb } from '../db/platform'
import { projects, apiKeys } from '../db/schema'
import { eq } from 'drizzle-orm'

const createProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    try {
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
                throw new ApiError('Failed to initialize storage directory', 500, 'INTERNAL_ERROR')
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
        if (error instanceof ApiError) {
            throw error
        }
        console.error('Project creation failed:', error)
        throw new ApiError('Failed to provision project resources', 500, 'INTERNAL_ERROR', error)
    }
}

const getAllProjects = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    try {
        const user = c.get('user')
        if (!user) {
            throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED')
        }
        const platformDb = getPlatformDb()
        // get all projects where owner id is equal to user id with api key
        const allProjects = await platformDb.select(
            {
                id: projects.id,
                name: projects.name,
                api_key: apiKeys.key,
                created_at: projects.createdAt
            }
        ).from(projects).where(eq(projects.ownerId, user.id)).innerJoin(apiKeys, eq(projects.id, apiKeys.projectId))
        return sendResponse(c, allProjects)
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        console.error('Failed to fetch projects:', error)
        throw new ApiError('Failed to fetch projects', 500, 'INTERNAL_ERROR', error)
    }
}

// update project by id
const updateProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    try {
        const id = c.req.param('id')
        const user = c.get('user')
        if (!user) {
            throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED')
        }
        const body = await c.req.json()
        const { name } = body
        if (!id || !name) {
            throw new ApiError('Project id and name are required', 400, 'INVALID_INPUT')
        }
        const platformDb = getPlatformDb()
        const project = await platformDb.select().from(projects).where(eq(projects.id, id))

        if (!project || project.length === 0) {
            throw new ApiError('Project not found', 404, 'NOT_FOUND')
        }

        if (project[0].ownerId !== user.id) {
            throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED')
        }

        const updatedProject = await platformDb.update(projects).set({ name }).where(eq(projects.id, id)).returning()
        return sendResponse(c, updatedProject[0] || { id, name })
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        console.error('Update project failed:', error)
        throw new ApiError('Failed to update project', 500, 'INTERNAL_ERROR', error)
    }
}

const getProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    try {
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

        // get all tables with their schema in the project database except _meta sqlite_sequence 
        const tables = db.prepare('SELECT name FROM sqlite_master WHERE type = "table" AND name != "_meta" AND name != "sqlite_sequence"').all()
        db.close()
        console.log(tables, meta, id)
        return sendResponse(c, {
            id,
            status: 'active',
            meta,
            tables
        })
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        console.error('Get project failed:', error)
        throw new ApiError('Failed to get project details', 500, 'INTERNAL_ERROR', error)
    }
}

// delete project by id
const deleteProject = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    try {
        const id = c.req.param('id')
        const user = c.get('user')
        if (!user) {
            throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED')
        }
        const platformDb = getPlatformDb()
        const project = await platformDb.select().from(projects).where(eq(projects.id, id))

        if (!project || project.length === 0) {
            throw new ApiError('Project not found', 404, 'NOT_FOUND')
        }

        if (project[0].ownerId !== user.id) {
            throw new ApiError('Unauthorized', 401, 'UNAUTHORIZED')
        }

        const deletedProject = await platformDb.delete(projects).where(eq(projects.id, id)).returning()

        // delete the project database
        const dbPath = path.resolve(process.cwd(), 'dbs', `${id}.sqlite`)
        if (fs.existsSync(dbPath)) {
            try {
                fs.unlinkSync(dbPath)
            } catch (e) {
                console.warn(`Failed to delete database file for project ${id}:`, e)
            }
        }

        return sendResponse(c, {
            message: 'Project deleted successfully',
            deletedProject: deletedProject[0]
        })
    } catch (error) {
        if (error instanceof ApiError) {
            throw error
        }
        console.error('Delete project failed:', error)
        throw new ApiError('Failed to delete project', 500, 'INTERNAL_ERROR', error)
    }
}

export {
    createProject,
    deleteProject,
    getProject,
    getAllProjects,
    updateProject
}