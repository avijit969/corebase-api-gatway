import { sign } from 'hono/jwt'

const SECRET = 'super_secure_jwt_secret_key_12345'
const PROJECT_ID = 'proj_c3fe655b-043' // Using the existing DB file ID
const USER_ID = 'test-user-1'
const PORT = 3000

async function main() {
    const token = await sign({
        sub: USER_ID,
        project_id: PROJECT_ID,
        role: 'authenticated',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    }, SECRET)

    console.log('Use this Token for testing:', token)

    const url = `ws://localhost:${PORT}/v1/realtime?token=${token}`
    console.log(`Connecting to ${url}...`)

    const ws = new WebSocket(url)

    ws.onopen = () => {
        console.log('✅ WebSocket Connected')

        const subMsg = {
            type: 'subscribe',
            id: 'sub-test-1',
            query: {
                from: 'posts',
                limit: 5,
                orderBy: 'id',
                order: 'DESC'
            }
        }
        console.log('Sending subscription:', subMsg)
        ws.send(JSON.stringify(subMsg))
    }

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString())
        console.log('📩 Received Message:', JSON.stringify(msg, null, 2))

        if (msg.type === 'data') {
            console.log('Initial data received. Now triggering an update via HTTP API...')
            triggerUpdate(token)
        }
    }

    ws.onerror = (e) => {
        console.error('❌ WebSocket Error:', e)
    }

    ws.onclose = (e) => {
        console.log('WebSocket Closed', e.code, e.reason)
    }
}

async function triggerUpdate(token: string) {
    try {
        // We will try to insert a new post to trigger an update
        // Adjust column names based on your 'posts' table schema
        // Based on quick check: id (PK), + others.
        // We'll trust auto-increment for ID or provide a random one if needed.
        // Assuming 'title' or similar exists, or just empty JSON if cols allow nullable.

        const res = await fetch(`http://localhost:${PORT}/v1/table_operation/insert/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                // Attempting generic fields, assuming schema might have them.
                // If this fails, the 'runQuery' simply won't return new data or error 
                // but the 'emitDBChange' is called in controller AFTER insert attempts (even if failed? No, inside try block).
                // Wait, emitDBChange is called BEFORE return but inside try?
                // In my edit:
                // } 
                // // Notify
                // emitDBChange...
                // return ...

                // So if insert fails (throws), it goes to catch, so NO emit.
                // I need valid data.

                // From check_db.ts I saw: id (INTEGER), is_public (BOOLEAN)
                id: Math.floor(Math.random() * 1000000),
                is_public: true
            })
        })

        const data = await res.json()
        console.log('Trigger Request Result:', data)

    } catch (e) {
        console.error('Trigger Update Failed:', e)
    }
}

main()
