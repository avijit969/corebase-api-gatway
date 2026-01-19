import { Hono } from 'hono'
import { Bindings, Variables } from '../types'
import { signUpload } from '../controllers/storage'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

app.post('/upload/sign', signUpload)

export default app
