import { Context, Next } from 'hono'
import { validateToken } from '../utils/jwt'
import { ApiError } from '../utils/errors'
import { getPlatformDb } from '../db/platform'
import { apiKeys } from '../db/schema'
import { eq } from 'drizzle-orm'

export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    const apiKey = c.req.header('x-api-key')
    const path = c.req.path
    // Platform auth routes and UI routes exception and all static files , fav icon
    if (path.startsWith('/v1/platform/auth') || path === '/' || path === '/docs' || path === '/health' || path.startsWith('/static') || path === '/favicon.ico') {
        return await next()
    }

    // 1. Validate API Key if present (sets Platform Context)
    if (apiKey) {
        // Validate API Key via Database
        const db = getPlatformDb()
        const [keyRecord] = await db.select()
            .from(apiKeys)
            .where(eq(apiKeys.key, apiKey))
            .limit(1)

        if (!keyRecord) {
            throw new ApiError('Invalid API Key', 401, 'AUTH_INVALID_KEY')
        }
        console.log('API Key Validated')
        console.log('Key Record:', keyRecord)
        const projectId = keyRecord.projectId
        c.set('projectId', projectId)
        // If no user token is provided later, we assume service role
        if (!authHeader) {
            c.set('role', 'service_role')
        }
    }

    // 2. Validate Bearer Token if present (sets User Context)
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1]
        const secret = c.env?.JWT_SECRET || 'super_secure_jwt_secret_key_12345'

        try {
            const payload = await validateToken(token, secret)
            console.log('Token Validated')
            console.log('Payload:', payload)
            const userId = payload.sub as string
            const projectIdFromToken = payload.project_id as string
            const role = (payload.role as string) || 'authenticated'
            const currentProjectId = c.get('projectId')

            if (currentProjectId && projectIdFromToken && currentProjectId !== projectIdFromToken) {
                console.warn('Project ID mismatch between API Key and Token', currentProjectId, projectIdFromToken)
                throw new ApiError('Project Context Mismatch', 403, 'AUTH_PROJECT_MISMATCH')
            }

            if (!currentProjectId && projectIdFromToken) {
                c.set('projectId', projectIdFromToken)
            }

            c.set('user', {
                id: userId,
                role: role,
                email: payload.email as string
            })
            c.set('role', role)

        } catch (e) {
            if (e instanceof ApiError) throw e
            throw new ApiError('Authentication failed', 401, 'AUTH_FAILED')
        }
    }

    const finalProjectId = c.get('projectId')
    const finalUser = c.get('user')

    if (!finalProjectId && !finalUser) {
        throw new ApiError('Missing authentication', 401, 'AUTH_REQUIRED')
    }

    await next()
}
