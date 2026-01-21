import { Hono } from "hono";
import { Bindings, Variables } from '../types'
import { login, register, getUserSession } from "../controllers/auth";

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

app.post('/signup', register)
app.post('/token', login)
app.get('/user', getUserSession)
export default app
