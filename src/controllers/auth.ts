import { Context } from 'hono'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { sign } from 'hono/jwt'
import { Bindings, Variables } from '../types'
import { getPlatformDb } from '../db/platform'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { validateToken } from '../utils/jwt'
import { sendWelcomeEmail } from '../utils/email'

export const register = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const body = await c.req.json()
    if (!body.email || !body.password) {
        throw new ApiError('Email and password required', 400, 'AUTH_INVALID_INPUT')
    }

    const db = getPlatformDb()

    try {
        const userId = 'user_' + crypto.randomUUID()
        const passwordHash = await Bun.password.hash(body.password)

        const result = await db.insert(users).values({
            id: userId,
            email: body.email,
            passwordHash: passwordHash,
            role: 'authenticated',
            name: body.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }).execute()

        // send welcome email to the new registered user
        sendWelcomeEmail(body.email, body.name || body.email.split('@')[0].toUpperCase())
        return sendResponse(c, {
            user: { id: userId, email: body.email }
        }, 201)
    } catch (e: any) {
        if (e.code === '2067') { // Unique violation
            throw new ApiError('Email already exists', 409, 'AUTH_EMAIL_EXISTS')
        }
        console.error(e)
        throw new ApiError('Failed to create user', 500, 'AUTH_ERROR')
    }
}

export const login = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
        throw new ApiError('Email and password required', 400, 'AUTH_INVALID_INPUT')
    }

    const db = getPlatformDb()

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

    if (!user) {
        throw new ApiError('Invalid credentials', 400, 'AUTH_INVALID_CREDENTIALS')
    }

    const valid = await Bun.password.verify(password, user.passwordHash)
    if (!valid) {
        throw new ApiError('Invalid credentials', 400, 'AUTH_INVALID_CREDENTIALS')
    }

    // Mint token
    const secret = c.env?.JWT_SECRET || 'super_secure_jwt_secret_key_12345'
    const token = await sign({
        sub: user.id,
        project_id: 'default',
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12, // 12 hour
    }, secret)

    return sendResponse(c, { access_token: token, expires_in: 3600 })
}
// get the currect user of the corebase dashboard user
const getUserSession = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const token = c.req.header('Authorization')?.split('Bearer ')[1]
    if (!token) {
        throw new ApiError('Token required', 401, 'AUTH_TOKEN_REQUIRED')
    }
    const secret = c.env?.JWT_SECRET || 'super_secure_jwt_secret_key_12345'
    const payload = await validateToken(token, secret)
    console.log(JSON.stringify(payload))
    // get user from db
    const db = getPlatformDb()
    const [user] = await db.select({
        id: users.id,
        email: users.email,
        role: users.role
    }).from(users).where(eq(users.id, payload.sub)).limit(1)
    return sendResponse(c, { user: user })
}

export { getUserSession }