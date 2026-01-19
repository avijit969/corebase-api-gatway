import { Bindings } from './types'

export const checkEnv = (env: Bindings) => {
    const required: (keyof Bindings)[] = [
        'JWT_SECRET',
        'DATABASE_URL',
        'STORAGE_BUCKET'
    ]

    for (const key of required) {
        if (!env[key]) {
            console.warn(`Missing environment variable: ${key}`)
        }
    }
}
