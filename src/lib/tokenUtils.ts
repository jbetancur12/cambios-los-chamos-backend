import { randomUUID } from 'node:crypto'
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

// jwtid makes every login a distinct token, so closing one session never closes another one
export const generateAccessToken = (payload: object) => {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '30d', jwtid: randomUUID() })
}

export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, SECRET_KEY) as JWTPayload
  } catch {
    return null
  }
}
