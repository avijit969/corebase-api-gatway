import { Context, Hono } from 'hono'
import { addSub, removeSub } from './subscriptions'
import { runQuery } from '../db/query-engine'
import { Bindings, Variables } from '../types'
import * as crypto from 'crypto'
import { upgradeWebSocket as bunUpgradeWebSocket } from 'hono/bun'

export const createRealtimeRouter = (upgradeWebSocket: typeof bunUpgradeWebSocket) => {
    const realtime = new Hono<{ Bindings: Bindings, Variables: Variables }>()

    realtime.get(
        '/',
        upgradeWebSocket(async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
            const user = c.get('user')
            const projectId = c.get('projectId')
            if (!user) {
                throw new Error('Unauthorized')
            }
            return {
                onMessage: async (event: any, ws: any) => {
                    const msg = JSON.parse(event.data.toString())
                    if (msg.type === 'subscribe') {
                        const data = await runQuery(msg.query, {
                            projectId: projectId,
                            userId: user.id
                        })
                        const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
                        addSub({
                            id: msg.id,
                            ws,
                            query: msg.query,
                            projectId: projectId,
                            userId: user.id,
                            hash
                        })
                        ws.send(JSON.stringify({
                            type: 'data',
                            id: msg.id,
                            data
                        }))
                    }
                    if (msg.type === 'unsubscribe') {
                        removeSub(msg.id)
                    }
                },
                onClose: (event: any, ws: any) => {
                    removeSub(undefined, ws)
                }
            }
        })
    )

    return realtime
}
