import { createHash } from 'node:crypto'
import { DI } from '@/di'
import { RevokedToken } from '@/entities/RevokedToken'
import { verifyAccessToken } from '@/lib/tokenUtils'

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const isTokenRevoked = async (token: string): Promise<boolean> => {
  const found = await DI.em.fork().count(RevokedToken, { tokenHash: hashToken(token) })
  return found > 0
}

/** Marks the token as closed until its natural expiry and drops rows that already expired. */
export const revokeToken = async (token: string): Promise<void> => {
  const exp = verifyAccessToken(token)?.exp
  if (!exp) return
  const em = DI.em.fork()
  await em.nativeDelete(RevokedToken, { expiresAt: { $lt: new Date() } })
  await em
    .getConnection()
    .execute(
      `INSERT INTO "revoked_token" ("token_hash", "expires_at", "revoked_at") VALUES (?, ?, now()) ON CONFLICT DO NOTHING`,
      [hashToken(token), new Date(exp * 1000)]
    )
}
