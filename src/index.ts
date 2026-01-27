import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import { Bindings, Variables } from './types'
import { handleError, ApiError } from './utils/errors'
import { requestId } from './middleware/requestId'
import { authMiddleware } from './middleware/auth'
import { projectMiddleware } from './middleware/project'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { policyMiddleware } from './middleware/policy'

import authRoutes from './routes/auth'
import dbRoutes from './routes/db'
import storageRoutes from './routes/storage'
import projectRoutes from './routes/projects'
import platformAuthRoutes from './routes/platform.auth'
import uiRoutes from './routes/ui'
import tableRoutes from './routes/table_operation'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// Global Middleware
app.use('*', requestId)
app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: ["*"]
}))

app.use('*', async (c, next) => {
  // Bun automatically loads .env into process.env, but Hono's c.env might differ in some setups.
  // We explicitly patch c.env from process.env for local development reliability.
  if (!c.env.R2_ACCESS_KEY_ID && process.env.R2_ACCESS_KEY_ID) {
    c.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  }
  if (!c.env.R2_SECRET_ACCESS_KEY && process.env.R2_SECRET_ACCESS_KEY) {
    c.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  }
  if (!c.env.R2_ENDPOINT && process.env.R2_ENDPOINT) {
    c.env.R2_ENDPOINT = process.env.R2_ENDPOINT
  }
  if (!c.env.R2_PUBLIC_URL && process.env.R2_PUBLIC_URL) {
    c.env.R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
  }
  if (!c.env.STORAGE_BUCKET && process.env.STORAGE_BUCKET) {
    c.env.STORAGE_BUCKET = process.env.STORAGE_BUCKET
  }
  await next()
})

// Core Logic Middleware
// Order matters: RateLimit -> Auth -> Project -> Policy
app.use('*', rateLimitMiddleware)
app.use('*', authMiddleware)
app.use('*', projectMiddleware)
app.use('*', policyMiddleware)

// Routes
app.route('/', uiRoutes)
app.route('/v1/auth', authRoutes)
app.route('/v1/platform/auth', platformAuthRoutes)
app.route('/v1/projects', projectRoutes)
app.route('/v1/db', dbRoutes)
app.route('/v1/storage', storageRoutes)
app.route('/v1/table_operation', tableRoutes)
// Health Check
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }))


app.onError((err, c) => {
  return handleError(err, c)
})

app.notFound((c) => {
  throw new ApiError('Route not found', 404, 'NOT_FOUND')
})

export default app
