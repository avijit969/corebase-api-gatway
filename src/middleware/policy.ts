import { Context, Next } from 'hono'
import { ApiError } from '../utils/errors'

export const policyMiddleware = async (c: Context, next: Next) => {
    const path = c.req.path
    if (path.startsWith('/v1/db')) {
        const role = c.get('role')

        // Service role bypasses RLS
        if (role === 'service_role') {
            await next()
            return
        }
        const method = c.req.method

        if (matchRawSql(c)) {
            throw new ApiError('Raw SQL not allowed from client', 403, 'POLICY_VIOLATION')
        }
    }

    await next()
}

function matchRawSql(c: Context): boolean {
    const path = c.req.path
    if (path.includes('/sql')) return true
    return false
}
