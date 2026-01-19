import { Context, Next } from 'hono'

export const requestId = async (c: Context, next: Next) => {
    const id = crypto.randomUUID()
    c.set('requestId', id)
    c.header('X-Request-ID', id)
    await next()
}
