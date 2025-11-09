import { User } from '@/entities/User'
import { UserRole } from '@/entities/User'
import { RequestUser } from '@/middleware/requestUser'

declare global {
  namespace Express {
    interface Request {
      user?: User
      context?: {
        requestUser?: RequestUser
        role?: UserRole
        userId?: string
      }
    }
  }
}
