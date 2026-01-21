import { Context } from 'hono'
import { Database } from 'bun:sqlite'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import * as path from 'node:path'
import * as fs from 'node:fs'

export interface CreateTableColumn {
    name: string
    type: 'integer' | 'text' | 'datetime' | 'boolean' | 'json' | string
    primary?: boolean
    autoIncrement?: boolean
    notNull?: boolean
    default?: any
    references?: {
        table: string
        column: string
        onDelete?: 'cascade' | 'set null' | 'restrict' | string
    }
}

export interface CreateTableIndex {
    columns: string[]
    unique?: boolean
}

export interface CreateTableRls {
    select?: string
    insert?: string
    update?: string
    delete?: string
}

export interface CreateTableRequest {
    table: string
    columns: CreateTableColumn[]
    indexes?: CreateTableIndex[]
    rls?: CreateTableRls
}

export const getProjectDbPath = (projectId: string) => {
    return path.resolve(process.cwd(), 'dbs', `${projectId}.sqlite`)
}

const createTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const body = await c.req.json() as CreateTableRequest
    const { table, columns, indexes, rls } = body

    if (!table || !columns || !Array.isArray(columns) || columns.length === 0) {
        throw new ApiError('Table name and columns are required', 400, 'DB_INVALID_INPUT')
    }

    if (!projectId) {
        throw new ApiError('Project ID is required', 400, 'DB_MISSING_PROJECT_ID')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    // VALIDATION: Ensure simple alphanumeric table names to prevent basic injection
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        db.close()
        throw new ApiError('Invalid table name', 400, 'DB_INVALID_TABLE_NAME')
    }

    const columnDefs: string[] = []

    for (const col of columns) {
        if (!/^[a-zA-Z0-9_]+$/.test(col.name)) {
            db.close()
            throw new ApiError(`Invalid column name: ${col.name}`, 400, 'DB_INVALID_COLUMN_NAME')
        }

        let def = `${col.name} ${col.type.toUpperCase()}`

        if (col.primary) {
            def += ' PRIMARY KEY'
        }

        if (col.autoIncrement) {
            def += ' AUTOINCREMENT'
        }

        if (col.notNull) {
            def += ' NOT NULL'
        }

        if (col.default !== undefined) {
            const defaultVal = typeof col.default === 'string' && col.default !== 'now' ? `'${col.default}'` : (col.default === 'now' ? 'CURRENT_TIMESTAMP' : col.default)
            def += ` DEFAULT ${defaultVal}`
        }


        if (col.references) {
            const { table: refTable, column: refCol, onDelete } = col.references
            def += ` REFERENCES ${refTable}(${refCol})`
            if (onDelete) {
                def += ` ON DELETE ${onDelete.toUpperCase()}`
            }
        }

        columnDefs.push(def)
    }

    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${table} (${columnDefs.join(', ')});`

    try {
        db.run(createTableQuery)

        // Handle Indexes
        if (indexes && Array.isArray(indexes)) {
            for (const idx of indexes) {
                const idxName = `idx_${table}_${idx.columns.join('_')}`
                const idxQuery = `CREATE INDEX IF NOT EXISTS ${idxName} ON ${table} (${idx.columns.join(', ')})`
                db.run(idxQuery)
            }
        }

        // TODO: Handle RLS policies storage

        db.close()
        return sendResponse(c, {
            message: `Table '${table}' created successfully`,
            table,
            columns,
            indexes,
            rls
        }, 201)
    } catch (e: any) {
        db.close()
        console.error('Create table error:', e)
        throw new ApiError(`Failed to create table: ${e.message}`, 500, 'DB_CREATE_TABLE_ERROR')
    }
}

const listAllTables = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')

    if (!projectId) {
        throw new ApiError('Project ID is required', 400, 'DB_MISSING_PROJECT_ID')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_meta'"
        const tables = db.query(query).all() as { name: string }[]

        return sendResponse(c, {
            tables: tables.map(t => ({
                name: t.name,
                created_at: null
            }))
        })
    } catch (e: any) {
        console.error('List tables error:', e)
        throw new ApiError(`Failed to list tables: ${e.message}`, 500, 'DB_LIST_TABLES_ERROR')
    } finally {
        db.close()
    }
}

const getTableDetails = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        // 1. Get Columns Info
        const columnsInfo = db.query(`PRAGMA table_info(${tableName})`).all() as { cid: number, name: string, type: string, notnull: number, dflt_value: any, pk: number }[]

        if (!columnsInfo || columnsInfo.length === 0) {
            throw new ApiError(`Table '${tableName}' not found`, 404, 'DB_TABLE_NOT_FOUND')
        }

        // 2. Get Foreign Keys
        const foreignKeys = db.query(`PRAGMA foreign_key_list(${tableName})`).all() as { id: number, seq: number, table: string, from: string, to: string, on_update: string, on_delete: string, match: string }[]
        const fkMap = new Map<string, { table: string, column: string, onDelete: string }>()

        foreignKeys.forEach(fk => {
            fkMap.set(fk.from, {
                table: fk.table,
                column: fk.to,
                onDelete: fk.on_delete.toLowerCase()
            })
        })

        // 3. Map Columns to Response Format
        const columns: CreateTableColumn[] = columnsInfo.map(col => {
            const isPk = col.pk === 1
            const isNotNull = col.notnull === 1
            const colDef: CreateTableColumn = {
                name: col.name,
                type: col.type.toLowerCase(),
            }

            if (isPk) colDef.primary = true
            if (isNotNull && !isPk) colDef.notNull = true
            if (col.dflt_value !== null) {
                let dflt = col.dflt_value
                if (typeof dflt === 'string' && dflt.startsWith("'") && dflt.endsWith("'")) {
                    dflt = dflt.slice(1, -1)
                }
                colDef.default = dflt
            }

            if (fkMap.has(col.name)) {
                colDef.references = fkMap.get(col.name)
            }

            return colDef
        })

        // 4. Get Indexes
        const indexList = db.query(`PRAGMA index_list(${tableName})`).all() as { seq: number, name: string, unique: number, origin: string, partial: number }[]
        const indexes: CreateTableIndex[] = []

        for (const idx of indexList) {
            if (idx.origin === 'c') {
                const idxInfo = db.query(`PRAGMA index_info(${idx.name})`).all() as { seqno: number, cid: number, name: string }[]
                const idxCols = idxInfo.map(i => i.name)

                const indexDef: CreateTableIndex = {
                    columns: idxCols,
                }
                if (idx.unique === 1) {
                    indexDef.unique = true
                }
                indexes.push(indexDef)
            }
        }

        // 5. RLS (Placeholder)
        const rls = {
            select: "true",
            insert: "true",
            update: "true",
            delete: "true"
        }

        return sendResponse(c, {
            table: tableName,
            columns,
            indexes,
            rls
        })
    } catch (e: any) {
        console.error('Get table details error:', e)
        if (e instanceof ApiError) throw e
        throw new ApiError(`Failed to get table details: ${e.message}`, 500, 'DB_GET_TABLE_DETAILS_ERROR')
    } finally {
        db.close()
    }
}

const addColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')
    const body = await c.req.json() as CreateTableColumn

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)
    console.log(body)
    try {
        const query = `ALTER TABLE ${tableName} ADD COLUMN ${body.name} ${body.type.toUpperCase()}`
        db.run(query)

        return sendResponse(c, {
            message: `Column '${body.name}' added to table '${tableName}' successfully`,
            table: tableName,
            column: body
        })
    } catch (e: any) {
        console.error('Add column error:', e)
        throw new ApiError(`Failed to add column: ${e.message}`, 500, 'DB_ADD_COLUMN_ERROR')
    } finally {
        db.close()
    }
}

const deleteColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')
    const columnName = c.req.param('column')

    if (!projectId || !tableName || !columnName) {
        throw new ApiError('Project ID, table name and column name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME_OR_COLUMN_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const query = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`
        db.run(query)

        return sendResponse(c, {
            message: `Column '${columnName}' deleted from table '${tableName}' successfully`,
            table: tableName,
            column: columnName
        })
    } catch (e: any) {
        console.error('Delete column error:', e)
        throw new ApiError(`Failed to delete column: ${e.message}`, 500, 'DB_DELETE_COLUMN_ERROR')
    } finally {
        db.close()
    }
}

const updateColumn = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')
    const columnName = c.req.param('column')
    const body = await c.req.json() as { name: string }

    if (!projectId || !tableName || !columnName) {
        throw new ApiError('Project ID, table name and column name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME_OR_COLUMN_NAME')
    }
    if (!body.name) {
        throw new ApiError('Column name is required', 400, 'DB_MISSING_COLUMN_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const query = `ALTER TABLE ${tableName} RENAME COLUMN ${columnName} TO ${body.name}`
        db.run(query)

        return sendResponse(c, {
            message: `Column '${columnName}' renamed to '${body.name}' in table '${tableName}' successfully`,
            table: tableName,
            column: body
        })
    } catch (e: any) {
        console.error('Update column error:', e)
        throw new ApiError(`Failed to update column: ${e.message}`, 500, 'DB_UPDATE_COLUMN_ERROR')
    } finally {
        db.close()
    }
}

const addForeignKey = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')
    const body = await c.req.json() as { column: string, references: { table: string, column: string }, onDelete: string }

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }
    if (!body.column || !body.references || !body.references.table || !body.references.column) {
        throw new ApiError('Column and references are required', 400, 'DB_MISSING_COLUMN_OR_REFERENCES')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const query = `ALTER TABLE ${tableName} ADD CONSTRAINT ${body.column}_fk FOREIGN KEY (${body.column}) REFERENCES ${body.references.table}(${body.references.column}) ON DELETE ${body.onDelete}`
        db.run(query)

        return sendResponse(c, {
            message: `Foreign key added to table '${tableName}' successfully`,
            table: tableName,
            foreignKey: body
        })
    } catch (e: any) {
        console.error('Add foreign key error:', e)
        throw new ApiError(`Failed to add foreign key: ${e.message}`, 500, 'DB_ADD_FOREIGN_KEY_ERROR')
    } finally {
        db.close()
    }
}

const deleteTable = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const tableName = c.req.param('table')

    if (!projectId || !tableName) {
        throw new ApiError('Project ID and table name are required', 400, 'DB_MISSING_PROJECT_ID_OR_TABLE_NAME')
    }

    const dbPath = getProjectDbPath(projectId)

    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const query = `DROP TABLE ${tableName}`
        db.run(query)

        return sendResponse(c, {
            message: `Table '${tableName}' deleted successfully`,
            table: tableName
        })
    } catch (e: any) {
        console.error('Delete table error:', e)
        throw new ApiError(`Failed to delete table: ${e.message}`, 500, 'DB_DELETE_TABLE_ERROR')
    } finally {
        db.close()
    }
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