// src/middleware/requestUser.ts
import { User } from '@/entities/User'

export class RequestUser {
  constructor(
    public user: User | null,
    public type: 'unauthenticatedUser' | 'authenticatedUser',
    public relatedEntity: any | null // Ej: project o contexto opcional
  ) {}
}
