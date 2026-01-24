import { Hono } from 'hono'
import { Bindings, Variables } from '../types'
import { signUpload, listFiles, deleteFile, createBucket, listBuckets, getBucket, deleteBucket, emptyBucket } from '../controllers/storage'

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

// Buckets
app.post('/buckets', createBucket)
app.get('/buckets', listBuckets)
app.get('/buckets/:name', getBucket)
app.delete('/buckets/:name', deleteBucket)
app.post('/buckets/:name/empty', emptyBucket)

// Files
app.post('/upload/sign', signUpload)
app.get('/files', listFiles)
app.delete('/files/:id', deleteFile)

export default app
