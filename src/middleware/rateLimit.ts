import { Context, Next } from 'hono'
import { ApiError } from '../utils/errors'

const rateLimitMap = new Map<string, { count: number, lastReset: number }>()

export const rateLimitMiddleware = async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown'
    const projectId = c.get('projectId') || 'anon'
    const key = `${projectId}:${ip}`

    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute
    const limit = 100 // requests per minute

    let record = rateLimitMap.get(key)

    if (!record || (now - record.lastReset > windowMs)) {
        record = { count: 0, lastReset: now }
    }

    record.count++
    rateLimitMap.set(key, record)

    if (record.count > limit) {
        c.header('Retry-After', '60')
        throw new ApiError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED')
    }

    await next()
}
