import { verify } from 'hono/jwt'
import { ApiError } from './errors'

export async function validateToken(token: string, secret: string) {
    try {
        const payload = await verify(token, secret, 'HS256')
        return payload
    } catch (e: any) {
        throw new ApiError('Invalid or expired token', 401, 'AUTH_INVALID_TOKEN', { originalError: e.message })
    }
}
