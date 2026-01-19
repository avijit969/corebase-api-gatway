import { Context } from 'hono'
import { StatusCode } from 'hono/utils/http-status'

export const sendResponse = (c: Context, data: any, status: StatusCode | number = 200) => {
    return c.json({
        data,
        meta: {
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }
    }, status as any)
}
