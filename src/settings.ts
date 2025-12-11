import { config } from 'dotenv'
import { resolve } from 'path'
import pino from 'pino'
import type { CorsOptions } from 'cors'

// Logger for settings validation (before main logger is configured)
const logger = pino({
  level: 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})
config({ path: resolve(__dirname, '../.env') })

function strToBool(input: string | boolean | undefined, defaultValue: boolean = false): boolean {
  if (!input) {
    return defaultValue
  }

  if (typeof input === 'boolean') {
    return input
  }

  if (input === undefined) {
    return false
  }

  const trueTerms = ['true', '1', 'yes', 'y', 't']
  const falseTerms = ['false', '0', 'no', 'n', 'f']

  const normalizedStr = input.trim().toLowerCase()

  if (trueTerms.includes(normalizedStr)) {
    return true
  } else if (falseTerms.includes(normalizedStr)) {
    return false
  } else {
    throw new Error('Input string does not represent a boolean value')
  }
}

export const TEST = strToBool(process.env.TEST)

export const NODE_ENV = process.env.NODE_ENV

export const IS_DEVELOPMENT = strToBool(process.env.IS_DEVELOPMENT) || NODE_ENV === 'development'

// Validar SECRET_KEY en producción
if (!process.env.SECRET_KEY && NODE_ENV === 'production') {
  logger.error('SECRET_KEY must be set in production environment')
  throw new Error('SECRET_KEY must be set in production environment')
}

export const SECRET_KEY = process.env.SECRET_KEY || 'UNSAFE_DEFAULT_SECRET_KEY'

// Advertir en desarrollo si se usa el default
if (!process.env.SECRET_KEY && IS_DEVELOPMENT) {
  logger.warn('Using default SECRET_KEY in development. Set SECRET_KEY in .env for production.')
}

// Superadmin defaults
export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@test.com'
export const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '123456'
export const SUPERADMIN_FULL_NAME = process.env.SUPERADMIN_FULL_NAME || 'Super Admin'

// postgres
export const DB_NAME = process.env.DB_NAME || 'skald'
export const DB_USER = process.env.DB_USER || 'postgres'
export const DB_PASSWORD = process.env.DB_PASSWORD || '12345678'
export const DB_HOST = process.env.DB_HOST || 'localhost'
export const DB_PORT = parseInt(process.env.DB_PORT || '5432')
export const DATABASE_URL =
  process.env.DATABASE_URL || `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`

// queue configuration
export const INTER_PROCESS_QUEUE = process.env.INTER_PROCESS_QUEUE || 'redis'

export const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL

export const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379')
export const CHANNEL_NAME = process.env.CHANNEL_NAME || 'process_memo'

export const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'localhost'
export const RABBITMQ_PORT = process.env.RABBITMQ_PORT || '5672'
export const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest'
export const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest'
export const RABBITMQ_VHOST = process.env.RABBITMQ_VHOST || '/'
export const RABBITMQ_QUEUE_NAME = process.env.RABBITMQ_QUEUE_NAME || 'process_memo'
export const PROJECT_ID = process.env.PROJECT_ID
export const CLIENT_EMAIL = process.env.CLIENT_EMAIL
export const PRIVATE_KEY = process.env.PRIVATE_KEY

export const SENTRY_DSN = process.env.SENTRY_DSN

// ---- CORS Configuration ----
export const CORS_ALLOW_CREDENTIALS = true

// Get allowed origins from environment or use defaults
const CORS_ORIGINS_ENV = process.env.CORS_ALLOWED_ORIGINS || ''
let CORS_ALLOWED_ORIGINS: string[]

if (CORS_ORIGINS_ENV) {
  CORS_ALLOWED_ORIGINS = CORS_ORIGINS_ENV.split(',').map((origin) => origin.trim())
} else if (IS_DEVELOPMENT) {
  CORS_ALLOWED_ORIGINS = [
    'https://zkq86shq.use2.devtunnels.ms:5173',
    'http://localhost:8000',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://192.168.40.12:5173',
    'http://192.168.40.15:5173',
  ]
} else {
  CORS_ALLOWED_ORIGINS = [
    'https://app.cambiosloschamo.com',
    'https://api.useskald.com',
    'https://platform.useskald.com',
  ]
}

// Add self-hosted deployment URLs
export const IS_SELF_HOSTED_DEPLOY = strToBool(process.env.IS_SELF_HOSTED_DEPLOY)
if (IS_SELF_HOSTED_DEPLOY) {
  const FRONTEND_URL = process.env.FRONTEND_URL
  const API_URL = process.env.API_URL
  if (FRONTEND_URL) {
    CORS_ALLOWED_ORIGINS.push(FRONTEND_URL)
  }
  if (API_URL) {
    CORS_ALLOWED_ORIGINS.push(API_URL)
  }
}

interface CorsCallback {
  (error: Error | null, allow?: boolean): void
}

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: CorsCallback) => {
    console.log(`[CORS] Origin recibido: ${origin}`)
    if (
      !origin ||
      IS_DEVELOPMENT ||
      CORS_ALLOWED_ORIGINS.some(
        (allowed) => origin.replace(/\/$/, '') === allowed || origin.endsWith('.cambiosloschamo.com')
      )
    ) {
      if (IS_DEVELOPMENT) console.log(`[CORS] Permitido: ${origin}`)
      callback(null, true)
    } else {
      console.warn(`[CORS] Bloqueado: ${origin}`)
      callback(new Error(`CORS: Origen no permitido → ${origin}`))
    }
  },
  exposedHeaders: ['Content-Disposition'],
  credentials: CORS_ALLOW_CREDENTIALS,
}

export { corsOptions }

export const ENABLE_SECURITY_SETTINGS = strToBool(process.env.ENABLE_SECURITY_SETTINGS, !IS_DEVELOPMENT)

// ---- Email Configuration ----
const DEFAULT_EMAIL_VERIFICATION_ENABLED = !(IS_DEVELOPMENT || IS_SELF_HOSTED_DEPLOY)
export const EMAIL_VERIFICATION_ENABLED = strToBool(
  process.env.EMAIL_VERIFICATION_ENABLED,
  DEFAULT_EMAIL_VERIFICATION_ENABLED
)

// Resend
export const RESEND_API_KEY = process.env.RESEND_API_KEY
export const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'useskald.com'

// Frontend URL
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

export const EXPRESS_SERVER_PORT = parseInt(process.env.EXPRESS_SERVER_PORT || '3000')

export const LOG_LEVEL = process.env.LOG_LEVEL || 'warn'

// PostHog
export const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || 'phc_B77mcYC1EycR6bKLgSNzjM9aaeiWXhoeizyriFIxWf2' // it's a public key that can be leaked
export const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
