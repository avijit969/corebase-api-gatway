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

const createTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
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

const listAllTables = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const getTableDetails = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const addColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const deleteColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const updateColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const addForeignKey = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

const deleteTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {

}

export {
    createTable,
    listAllTables,
    getTableDetails,
    addColumn,
    deleteColumn,
    updateColumn,
    addForeignKey,
    deleteTable
}