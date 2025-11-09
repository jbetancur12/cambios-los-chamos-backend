// src/lib/userTokenUtils.ts
import { DI } from '@/di'
import { UserToken, TokenType } from '@/entities/UserToken'
import { v4 as uuidv4 } from 'uuid'
import { User } from '@/entities/User'

export async function createUserToken(user: User, type: TokenType, minutes = 10): Promise<UserToken> {
  const repo = DI.em.getRepository(UserToken)

  // Eliminar tokens previos del mismo tipo
  await repo.nativeDelete({ user, type })

  const token = uuidv4()
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes)

  const record = repo.create({ user, token, type, expiresAt, used: false, createdAt: new Date() })
  await DI.em.persistAndFlush(record)
  return record
}

export async function validateUserToken(token: string, type: TokenType): Promise<UserToken | null> {
  const repo = DI.em.getRepository(UserToken)
  const record = await repo.findOne({ token, type }, { populate: ['user'] })

  if (!record) return null
  if (record.used) return null
  if (record.expiresAt < new Date()) return null

  return record
}

export async function markTokenUsed(token: UserToken): Promise<void> {
  token.used = true
  await DI.em.persistAndFlush(token)
}
