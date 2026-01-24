export interface Bindings {
    JWT_SECRET: string
    API_KEY_SECRET: string // If using signed API keys, or just a lookup
    DATABASE_URL: string
    STORAGE_BUCKET: string
    ADMIN_SECRET: string
    REDIS_URL?: string
    R2_ACCESS_KEY_ID: string
    R2_SECRET_ACCESS_KEY: string
    R2_ENDPOINT: string
    R2_PUBLIC_URL: string
    // STORAGE_BUCKET is already defined above
}

export interface Variables {
    requestId: string
    projectId: string
    user?: UserContext
    role: 'anon' | 'authenticated' | 'service_role'
}

export interface UserContext {
    id: string
    email?: string
    role: string
    metadata?: Record<string, any>
}

export interface AppError extends Error {
    statusCode: number
    code: string
    details?: any
}

export interface QueryRequest {
    query: string
    params?: any[]
}

export interface StorageRequest {
    path: string
    bucket: string
    action: 'upload' | 'download' | 'delete'
}
