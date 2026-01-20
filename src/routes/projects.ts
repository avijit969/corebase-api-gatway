import { Hono } from 'hono'
import { Bindings, Variables } from '../types'
import { createProject, deleteProject, getProject, getAllProjects, updateProject } from '../controllers/projects'
import { getAllAuthenticatedUsers } from '../controllers/projectAuth'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// POST / - Create a new project
app.post('/', createProject)

// GET /:id - Get Project Details 
app.get('/:id', getProject)

// GET / - Get All Projects 
app.get('/', getAllProjects)

// PUT /:id - Update Project Details 
app.put('/:id', updateProject)

// DELETE /:id - Delete Project 
app.delete('/:id', deleteProject)
// get all authenticated users for the project admin
app.get('/:projectId/users', getAllAuthenticatedUsers)
export default app
