import type { FilterQuery } from '@mikro-orm/core'
import type { Transferencista } from '@/entities/Transferencista'

/**
 * Transferencistas that can receive giros: marked as available AND whose user is active and not archived.
 * An archived or deactivated transferencista cannot log in, so a giro assigned to them would be stuck.
 * The system must always keep at least one transferencista in this pool.
 */
export const AVAILABLE_TRANSFERENCISTA: FilterQuery<Transferencista> = {
  available: true,
  user: { isActive: true, deletedAt: null },
}

/** Same rule as AVAILABLE_TRANSFERENCISTA, for an entity that is already loaded (its user must be populated). */
export const isInTransferencistaPool = (t: Transferencista): boolean =>
  t.available && t.user.isActive && !t.user.deletedAt
