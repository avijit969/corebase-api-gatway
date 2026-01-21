import { Context, Next } from 'hono'
import { ApiError } from '../utils/errors'

export const projectMiddleware = async (c: Context, next: Next) => {
    const path = c.req.path;
    // Skip for Auth, Projects (Creation/Management), Health, and UI
    if (path.startsWith('/v1/auth') || path.startsWith('/v1/projects') || path.startsWith('/health') || path.startsWith('/v1/platform/auth') || path === '/' || path === '/docs' || path.startsWith('/static') || path === '/favicon.ico') {
        return await next()
    }

    const projectId = c.get('projectId')

    if (!projectId) {
        // Should be caught by auth middleware, but double check
        throw new ApiError('Project not context bound', 500, 'INTERNAL_PROJECT_ERROR')
    }

    // TODO: Verify project status (active/suspended) via internal service cache
    // if (await isProjectSuspended(projectId)) ...

    await next()
}
