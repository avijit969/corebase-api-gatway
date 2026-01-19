import { Hono } from 'hono'
import { Bindings, Variables } from '../types'
import { createProject, getProject } from '../controllers/projects'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// POST / - Create a new project
app.post('/', createProject)

// GET /:id - Get Project Details (Mock)
app.get('/:id', getProject)

export default app
