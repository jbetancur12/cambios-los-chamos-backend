import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'

/**
 * Whether a user may read the data (balance, movements) of a minorista.
 * Admins can read any minorista; a minorista only their own; everyone else none.
 * Must run inside a request context.
 */
export const canAccessMinorista = async (user: User, minoristaId: string): Promise<boolean> => {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return true
  if (user.role !== UserRole.MINORISTA) return false

  const own = await DI.minoristas.findOne({ user: user.id })
  return own?.id === minoristaId
}
