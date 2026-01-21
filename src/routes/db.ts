import { Hono } from 'hono'
import {
    createTable,
    listAllTables,
    getTableDetails,
    addColumn,
    deleteColumn,
    updateColumn,
    addForeignKey,
    deleteTable
} from '../controllers/tables'
import { createRls, updateRls, deleteRls } from '../controllers/rls'
import { Bindings, Variables } from '../types'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// POST /tables - Create a new table
app.post('/tables', createTable)

// get all tables of a particular ptojcet
app.get('/tables', listAllTables)

// get table schema of particular table
app.get('/tables/:table', getTableDetails)

// add columes to a table
app.post('/tables/:table/columns', addColumn)

// delete a column from a table
app.delete('/tables/:table/columns/:column', deleteColumn)

// update a column from a table
app.put('/tables/:table/columns/:column', updateColumn)
// add foreign key between two tables
app.post('/tables/:table/foreign-keys', addForeignKey)
// delete a table
app.delete('/tables/:table', deleteTable)

// add rls to a particular table
app.post('/tables/:table/rls', createRls)
// update rls of a particular table
app.put('/tables/:table/rls', updateRls)
// delete rls of a particular table
app.delete('/tables/:table/rls', deleteRls)

export default app
