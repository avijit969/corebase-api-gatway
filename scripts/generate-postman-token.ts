import { sign } from 'hono/jwt'

const SECRET = 'super_secure_jwt_secret_key_12345'
const PROJECT_ID = 'proj_c3fe655b-043'
const USER_ID = 'postman-user'

async function generate() {
    const token = await sign({
        sub: USER_ID,
        project_id: PROJECT_ID,
        role: 'authenticated',
        email: 'postman@example.com',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    }, SECRET)

    console.log('\nCopy this URL into Postman WebSocket Request:')
    console.log(`ws://localhost:3000/v1/realtime?token=${token}`)

    console.log('\nThen send this JSON message to subscribe:')
    console.log(JSON.stringify({
        type: 'subscribe',
        id: 'postman-sub-1',
        query: {
            from: 'posts',
            limit: 5,
            orderBy: 'id',
            order: 'DESC'
        }
    }, null, 2))
}

generate()
