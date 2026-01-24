import { Context } from 'hono'
import { sendResponse } from '../utils/response'
import { ApiError } from '../utils/errors'
import { Bindings, Variables } from '../types'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Database } from 'bun:sqlite'
import * as fs from 'node:fs'
import { getProjectDbPath } from './tables'

// Helper to ensure tables exist
const ensureStorageTables = (db: Database) => {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS storage_buckets (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            public BOOLEAN DEFAULT 0,
            allowed_mime_types TEXT,
            file_size_limit INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `).run();

    // 2. Storage Files (Physical mapped)
    const hasOldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bucket'").get();
    if (hasOldTable) {
    }

    db.prepare(`
        CREATE TABLE IF NOT EXISTS storage_files (
            id TEXT PRIMARY KEY,
            bucket_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            mime_type TEXT,
            size INTEGER,
            key TEXT UNIQUE NOT NULL,
            url TEXT,
            uploaded_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (uploaded_by) REFERENCES auth_users(id),
            FOREIGN KEY (bucket_id) REFERENCES storage_buckets(id) ON DELETE CASCADE
        );
    `).run();
}

// --- Bucket Operations ---

export const createBucket = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const body = await c.req.json()
    const { name, public: isPublic, allowedMimeTypes, fileSizeLimit } = body

    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')
    if (!name) throw new ApiError('Bucket name required', 400, 'INVALID_INPUT')

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)
    try {
        ensureStorageTables(db)

        db.prepare(`
            INSERT INTO storage_buckets (id, name, public, allowed_mime_types, file_size_limit)
            VALUES (?, ?, ?, ?, ?)
        `).run(name, name, isPublic ? 1 : 0, JSON.stringify(allowedMimeTypes || []), fileSizeLimit || 0)

        db.close()
        return sendResponse(c, { message: 'Bucket created', bucket: { name, public: isPublic } }, 201)
    } catch (e: any) {
        db.close()
        if (e.message.includes('UNIQUE constraint failed')) {
            throw new ApiError('Bucket already exists', 409, 'BUCKET_EXISTS')
        }
        throw new ApiError('Failed to create bucket', 500, 'INTERNAL_ERROR', e)
    }
}

export const listBuckets = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)
    ensureStorageTables(db)

    const buckets = db.prepare('SELECT * FROM storage_buckets ORDER BY created_at DESC').all()

    // Parse JSON fields
    const parsed = buckets.map((b: any) => ({
        ...b,
        public: !!b.public,
        allowed_mime_types: JSON.parse(b.allowed_mime_types || '[]')
    }))

    db.close()
    return sendResponse(c, { buckets: parsed })
}

export const getBucket = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const name = c.req.param('name')

    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)
    ensureStorageTables(db)

    const bucket = db.prepare('SELECT * FROM storage_buckets WHERE name = ?').get(name) as any
    if (!bucket) {
        db.close()
        throw new ApiError('Bucket not found', 404, 'NOT_FOUND')
    }

    const files = db.prepare('SELECT * FROM storage_files WHERE bucket_id = ? ORDER BY created_at DESC').all(bucket.id)

    db.close()
    return sendResponse(c, {
        bucket: {
            ...bucket,
            public: !!bucket.public,
            allowed_mime_types: JSON.parse(bucket.allowed_mime_types || '[]')
        },
        files
    })
}

export const deleteBucket = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const name = c.req.param('name')

    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    const db = new Database(dbPath)
    ensureStorageTables(db)

    // Check if not empty
    const bucket = db.prepare('SELECT id FROM storage_buckets WHERE name = ?').get(name) as any
    if (!bucket) {
        db.close()
        throw new ApiError('Bucket not found', 404, 'NOT_FOUND')
    }

    const filesCount = db.prepare('SELECT count(*) as count FROM storage_files WHERE bucket_id = ?').get(bucket.id) as any
    if (filesCount.count > 0) {
        db.close()
        throw new ApiError('Bucket is not empty', 400, 'BUCKET_NOT_EMPTY')
    }

    db.prepare('DELETE FROM storage_buckets WHERE id = ?').run(bucket.id)
    db.close()

    return sendResponse(c, { message: 'Bucket deleted' })
}

export const emptyBucket = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const name = c.req.param('name')

    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    const db = new Database(dbPath)
    ensureStorageTables(db)

    const bucket = db.prepare('SELECT id FROM storage_buckets WHERE name = ?').get(name) as any
    if (!bucket) {
        db.close()
        throw new ApiError('Bucket not found', 404, 'NOT_FOUND')
    }

    db.prepare('DELETE FROM storage_files WHERE bucket_id = ?').run(bucket.id)
    db.close()
    return sendResponse(c, { message: 'Bucket emptied' })
}


// --- Updated File Operations ---

export const signUpload = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const user = c.get('user')
    const body = await c.req.json()
    const { filename, contentType, size, bucketName } = body

    if (!filename || !contentType || !bucketName) {
        throw new ApiError('Filename, contentType, and bucketName required', 400, 'STORAGE_INVALID_INPUT')
    }

    // if (!user) {
    //     throw new ApiError('User authentication required', 401, 'AUTH_REQUIRED')
    // }

    const projectId = c.get('projectId')
    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)
    ensureStorageTables(db)

    // Verify constraints
    const bucket = db.prepare('SELECT * FROM storage_buckets WHERE name = ?').get(bucketName) as any
    if (!bucket) {
        db.close()
        throw new ApiError(`Bucket '${bucketName}' not found`, 404, 'BUCKET_NOT_FOUND')
    }

    // Check size limit
    if (bucket.file_size_limit && size && size > bucket.file_size_limit) {
        db.close()
        throw new ApiError(`File size exceeds bucket limit (${bucket.file_size_limit})`, 400, 'SIZE_LIMIT_EXCEEDED')
    }

    // Initialize S3 Client
    if (!c.env.R2_ACCESS_KEY_ID || !c.env.R2_SECRET_ACCESS_KEY) {
        db.close()
        console.error('Storage configuration missing')
        throw new ApiError('Storage configuration missing', 500, 'STORAGE_CONFIG_ERROR')
    }

    const S3 = new S3Client({
        region: 'auto',
        endpoint: c.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: c.env.R2_ACCESS_KEY_ID,
            secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
        },
    })

    const safeFilename = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '')
    // Prefix with bucketName for organization in R2
    const key = `${projectId}/${bucketName}/${Date.now()}_${safeFilename}`

    try {
        const command = new PutObjectCommand({
            Bucket: c.env.STORAGE_BUCKET,
            Key: key,
            ContentType: contentType,
        })

        const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })
        const publicUrl = c.env.R2_PUBLIC_URL ? `${c.env.R2_PUBLIC_URL}/${key}` : signedUrl.split('?')[0]

        const fileId = crypto.randomUUID()

        db.prepare(`
            INSERT INTO storage_files (id, bucket_id, filename, mime_type, size, key, url, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(fileId, bucket.id, filename, contentType, size || 0, key, publicUrl, user?.id || null)

        db.close()

        return sendResponse(c, {
            uploadUrl: signedUrl,
            publicUrl: publicUrl,
            key: key,
            fileId: fileId,
            bucket: bucketName
        })

    } catch (error) {
        db.close()
        console.error('Storage Error:', error)
        throw new ApiError('Failed to generate upload URL', 500, 'STORAGE_ERROR', error)
    }
}

export const listFiles = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const bucketName = c.req.query('bucket')

    if (!projectId) throw new ApiError('Project ID required', 400, 'PROJECT_REQUIRED')

    const dbPath = getProjectDbPath(projectId)
    if (!fs.existsSync(dbPath)) throw new ApiError('Project database not found', 404, 'DB_NOT_FOUND')

    const db = new Database(dbPath)
    ensureStorageTables(db)

    let files: any[];
    if (bucketName) {
        const bucket = db.prepare('SELECT id FROM storage_buckets WHERE name = ?').get(bucketName) as any
        if (!bucket) {
            files = []
        } else {
            files = db.prepare('SELECT * FROM storage_files WHERE bucket_id = ? ORDER BY created_at DESC').all(bucket.id)
        }
    } else {
        files = db.prepare('SELECT * FROM storage_files ORDER BY created_at DESC').all()
    }

    db.close()
    return sendResponse(c, { files })
}

// Delete file updated to use storage_files table
export const deleteFile = async (c: Context<{ Bindings: Bindings, Variables: Variables }>) => {
    const projectId = c.get('projectId')
    const fileId = c.req.param('id')

    if (!projectId || !fileId) throw new ApiError('Project ID/File ID required', 400, 'INVALID_INPUT')

    const dbPath = getProjectDbPath(projectId)
    const db = new Database(dbPath)
    ensureStorageTables(db)

    const file = db.prepare('SELECT key FROM storage_files WHERE id = ?').get(fileId) as { key: string } | undefined
    if (!file) {
        db.close()
        throw new ApiError('File not found', 404, 'NOT_FOUND')
    }

    const S3 = new S3Client({
        region: 'auto',
        endpoint: c.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: c.env.R2_ACCESS_KEY_ID,
            secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
        },
    })

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')

    try {
        await S3.send(new DeleteObjectCommand({
            Bucket: c.env.STORAGE_BUCKET,
            Key: file.key
        }))

        db.prepare('DELETE FROM storage_files WHERE id = ?').run(fileId)
        db.close()

        return sendResponse(c, { message: 'File deleted' })
    } catch (e: any) {
        db.close()
        throw new ApiError('Failed to delete file', 500, 'STORAGE_DELETE_ERROR', e)
    }
}
