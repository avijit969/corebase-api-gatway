import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
        if (times > 3) {
            console.warn('Redis connection failed, disabling caching temporarily.')
            return null
        }
        return Math.min(times * 50, 2000)
    }
})

redis.on('error', (err) => {
    console.error('Redis error:', err)
})

redis.on('connect', () => {
    console.log('Connected to Redis')
})
