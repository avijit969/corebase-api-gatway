import { Context } from 'hono'
import { Database } from 'bun:sqlite'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import * as path from 'node:path'
import * as fs from 'node:fs'

export const getProjectDbPath = (projectId: string) => {
    return path.resolve(process.cwd(), 'dbs', `${projectId}.sqlite`)
}

export const createTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const body = await c.req.json()
    const { name, schema } = body

    if (!name || !schema) {
        throw new ApiError('Table name and schema are required', 400, 'DB_INVALID_INPUT')
    }

    if (!projectId) {
        throw new ApiError('Project ID is required', 400, 'DB_MISSING_PROJECT_ID')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    // Build CREATE TABLE query
    // Schema expected format: { column: "type constraints", ... }
    // e.g., { id: "INTEGER PRIMARY KEY AUTOINCREMENT", title: "TEXT NOT NULL" }

    // VALIDATION: Ensure simple alphanumeric table names to prevent basic injection
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        db.close()
        throw new ApiError('Invalid table name', 400, 'DB_INVALID_TABLE_NAME')
    }

    const columns = Object.entries(schema).map(([colName, colDef]) => {
        // rudimentary injection check for column names
        if (!/^[a-zA-Z0-9_]+$/.test(colName)) {
            throw new Error(`Invalid column name: ${colName}`)
        }
        return `${colName} ${colDef}`
    }).join(', ')

    const query = `CREATE TABLE IF NOT EXISTS ${name} (${columns});`

    try {
        db.run(query)
        db.close()
        return sendResponse(c, {
            message: `Table '${name}' created successfully`,
            table: name,
            schema
        }, 201)
    } catch (e: any) {
        db.close()
        console.error('Create table error:', e)
        throw new ApiError(`Failed to create table: ${e.message}`, 500, 'DB_CREATE_TABLE_ERROR')
    }
}

export const listRows = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const table = c.req.param('table')
    const user = c.get('user')
    const projectId = c.get('projectId')

    if (!projectId) {
        throw new ApiError('Project ID is required', 400, 'DB_MISSING_PROJECT_ID')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    // Validate table name
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        db.close()
        throw new ApiError('Invalid table name', 400, 'DB_INVALID_TABLE_NAME')
    }

    try {
        // Enforce structured query
        // "Automatically inject user_id filters" - SIMULATED RLS
        // In a real implementation, we would inspect the schema or have a policy engine.
        // For now, if the table has a 'user_id' column, we filter by it.

        // Check if user_id column exists
        const tableInfo = db.query(`PRAGMA table_info(${table})`).all() as any[]
        const hasUserId = tableInfo.some(col => col.name === 'user_id')

        let query = `SELECT * FROM ${table}`
        const params: any[] = []

        if (hasUserId && user?.id) {
            query += ` WHERE user_id = ?`
            params.push(user.id)
        }

        // Limit results
        query += ` LIMIT 100`

        const rows = db.prepare(query).all(...params)
        db.close()

        return sendResponse(c, {
            data: rows,
            meta: { count: rows.length }
        })

    } catch (e: any) {
        db.close()
        // If table doesn't exist
        if (e.message.includes('no such table')) {
            throw new ApiError(`Table '${table}' does not exist`, 404, 'DB_TABLE_NOT_FOUND')
        }
        console.error('List rows error:', e)
        throw new ApiError('Failed to list rows', 500, 'DB_QUERY_ERROR')
    }
}

export const createRow = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const table = c.req.param('table')
    const user = c.get('user')
    const projectId = c.get('projectId')

    if (!projectId) {
        throw new ApiError('Project ID is required', 400, 'DB_MISSING_PROJECT_ID')
    }

    const body = await c.req.json()
    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }
    const db = new Database(dbPath)

    // Validate table name
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        db.close()
        throw new ApiError('Invalid table name', 400, 'DB_INVALID_TABLE_NAME')
    }

    try {
        // Force user_id injection if the column exists
        const tableInfo = db.query(`PRAGMA table_info(${table})`).all() as any[]
        const hasUserId = tableInfo.some(col => col.name === 'user_id')

        const record = { ...body }
        if (hasUserId && user?.id && !record.user_id) {
            record.user_id = user.id
        }

        const columns = Object.keys(record)
        const placeholders = columns.map(() => '?').join(', ')
        const values = Object.values(record)

        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`

        const inserted = db.prepare(query).get(...values as any[])
        db.close()

        return sendResponse(c, {
            data: inserted,
            operation: 'INSERT',
            table
        }, 201)

    } catch (e: any) {
        db.close()
        console.error('Create row error:', e)
        throw new ApiError(`Failed to insert row: ${e.message}`, 500, 'DB_INSERT_ERROR')
    }
}
