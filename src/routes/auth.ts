import { Hono } from 'hono'
import { Bindings, Variables } from '../types'
import { register, login } from '../controllers/auth'
import { projectSignup, projectLogin, projectMe } from '../controllers/projectAuth'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()


// Project End-User Auth
app.post('/project/signup', projectSignup)
app.post('/project/login', projectLogin)
app.get('/project/me', projectMe)

export default app
