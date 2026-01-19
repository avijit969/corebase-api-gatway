import { Context } from 'hono'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'

export const signUpload = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const user = c.get('user')
    const body = await c.req.json()
    const { filename, contentType, size } = body

    if (!filename || !contentType) {
        throw new ApiError('Filename and contentType required', 400, 'STORAGE_INVALID_INPUT')
    }

    if (!user) {
        throw new ApiError('User authentication required', 401, 'AUTH_REQUIRED')
    }

    // Validate size (e.g. max 10MB)
    if (size && size > 10 * 1024 * 1024) {
        throw new ApiError('File too large', 400, 'STORAGE_SIZE_LIMIT')
    }

    // Generate path with isolation: project_id/user_id/filename
    const projectId = c.get('projectId')
    const key = `${projectId}/${user.id}/${filename}`

    // Mock R2 Presigned URL
    const signedUrl = `https://storage.example.com/${key}?signature=mock_sig_123`

    return sendResponse(c, {
        uploadUrl: signedUrl,
        key: key
    })
}
