import { Context } from 'hono'
import { StatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
    statusCode: StatusCode | number
    code: string
    details?: any

    constructor(message: string, statusCode: StatusCode | number, code: string, details?: any) {
        super(message)
        this.name = 'ApiError'
        this.statusCode = statusCode
        this.code = code
        this.details = details
    }
}

export const handleError = (err: Error | ApiError, c: Context) => {
    console.error(err)

    if (err instanceof ApiError) {
        return c.json({
            error: {
                message: err.message,
                code: err.code,
                details: err.details,
                requestId: c.get('requestId')
            }
        }, err.statusCode as any)
    }

    return c.json({
        error: {
            message: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            requestId: c.get('requestId'),
            details: String(err)
        }
    }, 500)
}
