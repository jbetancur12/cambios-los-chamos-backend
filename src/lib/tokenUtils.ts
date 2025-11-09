import jwt from 'jsonwebtoken'
import { SECRET_KEY } from '@/settings'
import { UserRole } from '@/entities/User'

/**
 * Payload del JWT para tokens de acceso
 */
export interface JWTPayload {
  email: string
  id: string
  role: UserRole
  iat?: number
  exp?: number
}

export const generateAccessToken = (payload: object) => {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '30d' })
}

export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, SECRET_KEY) as JWTPayload
  } catch {
    return null
  }
}
