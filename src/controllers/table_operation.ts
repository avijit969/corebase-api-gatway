import { Context } from "hono"
import { sendResponse } from "../utils/response"
import { ApiError } from "../utils/errors"
import { getProjectDbPath } from "./tables"
import Database from "bun:sqlite"
import * as fs from 'node:fs'
import { Bindings, Variables } from '../types'

const insertTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table_name')

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const body = await c.req.json()
        let rows: Record<string, any>[] = []

        if (Array.isArray(body)) {
            rows = body
        } else if (body.values && Array.isArray(body.values)) {
            rows = body.values
        } else if (typeof body === 'object' && body !== null) {
            rows = [body]
        }

        if (rows.length === 0) {
            return sendResponse(c, { message: 'No data to insert', count: 0 })
        }

        // Verify table exists
        const tableCheck = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
        if (!tableCheck) {
            throw new ApiError(`Table '${tableName}' not found`, 404, 'DB_TABLE_NOT_FOUND')
        }

        // Use keys from the first row to determine columns
        const firstRow = rows[0]
        const columns = Object.keys(firstRow)
        const validColumns = columns.filter(k => /^[a-zA-Z0-9_]+$/.test(k)) // Basic sanitization

        if (validColumns.length === 0) {
            throw new ApiError('No valid columns provided for insert', 400, 'DB_INVALID_INPUT')
        }

        const columnNames = validColumns.map(c => `"${c}"`).join(', ')
        const placeholders = validColumns.map(() => '?').join(', ')
        const sql = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`

        const stmt = db.prepare(sql)

        const insertTx = db.transaction((data: Record<string, any>[]) => {
            let count = 0
            for (const row of data) {
                const values = validColumns.map(col => row[col])
                stmt.run(values as any)
                count++
            }
            return count
        })

        const insertedCount = insertTx(rows)

        return sendResponse(c, {
            message: 'Rows inserted successfully',
            count: insertedCount
        }, 201)

    } catch (e: any) {
        console.error('Insert table error:', e)
        if (e instanceof ApiError) throw e
        // Handle common SQLite errors
        if (e.message.includes('UNIQUE constraint failed')) {
            throw new ApiError(`Insert failed: ${e.message}`, 409, 'DB_CONSTRAINT_ERROR')
        }
        throw new ApiError(`Failed to insert data: ${e.message}`, 500, 'DB_INSERT_ERROR')
    } finally {
        db.close()
    }
}


// Helper to build WHERE clause
const buildWhereClause = (where: Record<string, any>) => {
    const conditions: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(where)) {
        if (/^[a-zA-Z0-9_]+$/.test(key)) {
            conditions.push(`${key} = ?`)
            params.push(value)
        }
    }

    return {
        clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        params
    }
}

const updateTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table_name')
    const body = await c.req.json() as { updates: Record<string, any>, where: Record<string, any> }

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    // Updates are required
    if (!body.updates || Object.keys(body.updates).length === 0) {
        throw new ApiError('No updates provided', 400, 'DB_MISSING_UPDATES')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)

    try {
        const setClauses: string[] = []
        const params: any[] = []

        for (const [key, value] of Object.entries(body.updates)) {
            if (/^[a-zA-Z0-9_]+$/.test(key)) {
                setClauses.push(`"${key}" = ?`)
                params.push(value)
            }
        }

        if (setClauses.length === 0) {
            throw new ApiError('Invalid update columns', 400, 'DB_INVALID_INPUT')
        }

        const whereResult = buildWhereClause(body.where || {})
        params.push(...whereResult.params)

        const sql = `UPDATE "${tableName}" SET ${setClauses.join(', ')} ${whereResult.clause}`
        const info = db.run(sql, params)

        return sendResponse(c, { message: 'Rows updated successfully', changes: info.changes })
    } catch (e: any) {
        console.error('Update table error:', e)
        if (e instanceof ApiError) throw e
        throw new ApiError(`Failed to update data: ${e.message}`, 500, 'DB_UPDATE_ERROR')
    } finally {
        db.close()
    }
}

const deleteTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table_name')
    let where = {}
    try {
        const body = await c.req.json() as { where: Record<string, any> }
        where = body.where || {}
    } catch (e) {
    }

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)

    try {
        const whereResult = buildWhereClause(where)

        const sql = `DELETE FROM "${tableName}" ${whereResult.clause}`
        const info = db.run(sql, whereResult.params)

        return sendResponse(c, { message: 'Rows deleted successfully', changes: info.changes })
    } catch (e: any) {
        console.error('Delete table error:', e)
        if (e instanceof ApiError) throw e
        throw new ApiError(`Failed to delete data: ${e.message}`, 500, 'DB_DELETE_ERROR')
    } finally {
        db.close()
    }
}

const selectTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table_name')
    const query = c.req.query()

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }
    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)

    try {
        let filters: Record<string, any> = {}
        let limit = 10
        let page = 1
        let sort = ''
        let order = 'ASC'
        let selectColumns = '*'
        let body: any = {}
        try {
            if (c.req.header('content-type')?.includes('application/json')) {
                body = await c.req.json()
            }
        } catch (e) {
            // No body or invalid json
        }

        if (Object.keys(body).length > 0) {
            console.log(body.where)
            filters = body.where || {}
            limit = typeof body.limit === 'number' ? body.limit : 10
            if (typeof body.page === 'number') {
                page = body.page
            } else if (typeof body.offset === 'number') {
                page = Math.floor(body.offset / limit) + 1
            }

            sort = body.sort || ''
            order = (body.order || 'ASC').toUpperCase()

            if (body.columns && Array.isArray(body.columns) && body.columns.length > 0) {
                const validCols = body.columns.filter((c: string) => /^[a-zA-Z0-9_]+$/.test(c))
                if (validCols.length > 0) {
                    selectColumns = validCols.map((c: string) => `"${c}"`).join(', ')
                }
            }
        } else {
            limit = parseInt(query._limit || '10')
            page = parseInt(query._page || '1')
            sort = query._sort || ''
            order = (query._order || 'asc').toUpperCase()

            for (const [key, value] of Object.entries(query)) {
                if (!['_limit', '_page', '_sort', '_order'].includes(key)) {
                    filters[key] = value
                }
            }
        }

        const offset = (page - 1) * limit
        const whereResult = buildWhereClause(filters)

        let sql = `SELECT ${selectColumns} FROM "${tableName}" ${whereResult.clause}`

        if (sort && /^[a-zA-Z0-9_]+$/.test(sort)) {
            const validOrder = order === 'DESC' ? 'DESC' : 'ASC'
            sql += ` ORDER BY "${sort}" ${validOrder}`
        }
        sql += ` LIMIT ? OFFSET ?`
        whereResult.params.push(limit, offset)

        const countSql = `SELECT COUNT(*) as total FROM "${tableName}" ${whereResult.clause}`

        const countParams = whereResult.params.slice(0, -2)

        const totalResult = db.query(countSql).get(...countParams) as { total: number }
        const total = totalResult ? totalResult.total : 0

        const rows = db.query(sql).all(...whereResult.params)

        return sendResponse(c, {
            data: rows,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        })
    } catch (e: any) {
        console.error('Select table error:', e)
        if (e instanceof ApiError) throw e
        throw new ApiError(`Failed to select data: ${e.message}`, 500, 'DB_SELECT_ERROR')
    } finally {
        db.close()
    }
}

export { insertTable, updateTable, deleteTable, selectTable }