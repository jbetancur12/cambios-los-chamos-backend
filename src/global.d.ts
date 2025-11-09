import type { RequestUser } from '@/middleware/requestUser'

declare global {
    namespace Express {
        interface Request {
            context?: {
                requestUser?: RequestUser
                role?: string
                userId?: string
            }
        }
        interface Response {
            sentry?: string
        }
    }
}

export { }