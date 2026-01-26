import { Context } from 'hono'
import { Database } from 'bun:sqlite'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import { sign } from 'hono/jwt'
import * as fs from 'node:fs'
import { getProjectDbPath } from './tables'
import { sendEndUserWelcomeEmail, sendWelcomeEmail } from '../utils/email'
// register the end user of the project
const projectSignup = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    let projectId: string | undefined = c.get('projectId')
    if (!projectId) {
        throw new ApiError('Project ID required header (x-project-id)', 400, 'AUTH_MISSING_PROJECT')
    }

    const body = await c.req.json()
    const { email, password, name, emailTemplate } = body
    if (emailTemplate) {
        // TODO send email to the user

    } else {
        sendEndUserWelcomeEmail(email, name)
    }
    if (!email || !password) {
        throw new ApiError('Email and password required', 400, 'AUTH_INVALID_INPUT')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)

    try {
        const userId = 'user_' + crypto.randomUUID()
        const passwordHash = await Bun.password.hash(body.password)

        db.prepare(`
            INSERT INTO auth_users (id, email, password_hash, role, name)
            VALUES ($id, $email, $hash, 'user', $name)
        `).run({
            $id: userId,
            $email: email,
            $hash: passwordHash,
            $name: name
        })

        db.close()
        return sendResponse(c, {
            id: userId,
            email: email,
            name: name,
            role: 'user',
            message: 'User registered successfully'
        }, 201)

    } catch (e: any) {
        db.close()
        if (e.message && e.message.includes('UNIQUE constraint failed')) {
            throw new ApiError('Email already exists', 409, 'AUTH_EMAIL_EXISTS')
        }
        console.error('Project signup error:', e)
        throw new ApiError('Failed to register user', 500, 'AUTH_ERROR')
    }
}

// login the end user of the project
const projectLogin = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    let projectId: string | undefined = c.get('projectId')
    if (!projectId) {
        throw new ApiError('Project ID required header', 400, 'AUTH_MISSING_PROJECT')
    }

    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
        throw new ApiError('Email and password required', 400, 'AUTH_INVALID_INPUT')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)
    const user = db.prepare('SELECT * FROM auth_users WHERE email = ?').get(email) as any
    db.close()

    if (!user) {
        throw new ApiError('Invalid credentials', 400, 'AUTH_INVALID_CREDENTIALS')
    }

    const valid = await Bun.password.verify(password, user.password_hash)
    if (!valid) {
        throw new ApiError('Invalid credentials', 400, 'AUTH_INVALID_CREDENTIALS')
    }

    const secret = c.env?.JWT_SECRET || 'super_secure_jwt_secret_key_12345'
    const token = await sign({
        sub: user.id,
        project_id: projectId,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }, secret)

    return sendResponse(c, {
        access_token: token,
        expires_in: 60 * 60 * 24 * 7,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            created_at: user.created_at,
        }
    })
}

// get the end user profile
const projectMe = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const userPayload = c.get('user')
    let projectId = c.get('projectId')

    if (!projectId) {
        throw new ApiError('Project ID required header', 400, 'AUTH_MISSING_PROJECT')
    }

    if (!userPayload || !projectId) {
        throw new ApiError('Not authenticated', 401, 'AUTH_REQUIRED')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)
    const user = db.prepare('SELECT id, email, role, created_at FROM auth_users WHERE id = ?').get(userPayload.id) as any
    db.close()

    if (!user) {
        throw new ApiError('User not found', 404, 'AUTH_USER_NOT_FOUND')
    }
    return sendResponse(c, {
        user
    })
}


const getAllAuthenticatedUsers = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const userPayload = c.get('user')
    let projectId = c.req.param('projectId')

    if (!projectId) {
        throw new ApiError('Project ID required header', 400, 'AUTH_MISSING_PROJECT')
    }

    if (!userPayload || !projectId) {
        throw new ApiError('Not authenticated', 401, 'AUTH_REQUIRED')
    }

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) {
        throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')
    }

    const db = new Database(dbPath)
    const users = db.prepare('SELECT id, email, role,name, created_at FROM auth_users').all() as any[]
    db.close()

    return sendResponse(c, {
        users
    })
}


export {
    projectSignup,
    projectLogin,
    projectMe,
    getAllAuthenticatedUsers
}