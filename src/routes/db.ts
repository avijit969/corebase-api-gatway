import { Hono } from 'hono'
import { listRows, createRow, createTable } from '../controllers/db'
import { Bindings, Variables } from '../types'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// POST /tables - Create a new table
app.post('/tables', createTable)

// GET /:table - List rows
app.get('/:table', listRows)

// POST /:table - Create row
app.post('/:table', createRow)

export default app
