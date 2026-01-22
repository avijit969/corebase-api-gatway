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
app.use('*', cors())

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
