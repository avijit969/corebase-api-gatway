import { Hono } from "hono";
import { Bindings, Variables } from '../types'
import { login, register } from "../controllers/auth";

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

app.post('/signup', register)
app.post('/token', login)

export default app
