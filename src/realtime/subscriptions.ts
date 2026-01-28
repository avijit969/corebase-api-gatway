import * as crypto from 'crypto'
import { runQuery } from '../db/query-engine'

type Sub = {
    id: string
    ws: WebSocket
    query: any
    projectId: string
    userId: string
    hash: string
}

const globalSubs = globalThis as unknown as { __realtime_subs__: Map<string, Sub> }
if (!globalSubs.__realtime_subs__) {
    globalSubs.__realtime_subs__ = new Map<string, Sub>()
}
const subs = globalSubs.__realtime_subs__

export function addSub(sub: Sub) {
    subs.set(sub.id, sub)
}

export function removeSub(id?: string, ws?: any) {
    if (id) {
        if (subs.delete(id)) {
        }
    }

    if (ws) {
        for (const [key, sub] of subs) {
            if (sub.ws === ws) {
                subs.delete(key)
            }
        }
    }
}

export async function notifyChange(event: {
    table: string
    projectId: string
}) {
    for (const sub of subs.values()) {
        if (
            sub.projectId === event.projectId &&
            (sub.query.from === event.table)
        ) {
            try {
                const data = await runQuery(sub.query, {
                    projectId: sub.projectId,
                    userId: sub.userId
                })

                const newHash = crypto
                    .createHash('sha256')
                    .update(JSON.stringify(data))
                    .digest('hex')
                if (newHash !== sub.hash) {
                    sub.ws.send(JSON.stringify({
                        type: 'data',
                        id: sub.id,
                        data
                    }))
                    sub.hash = newHash
                } else {
                    console.log(`[Realtime] No data change for ${sub.id}`)
                }
            } catch (err) {
                console.error(`[Realtime] Error processing sub ${sub.id}:`, err)
            }
        } else {
            // No match
        }
    }
}
