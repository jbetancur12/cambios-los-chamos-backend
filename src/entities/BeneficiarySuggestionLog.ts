import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

export type BeneficiarySuggestionLogAction = 'CREADA' | 'ACTUALIZADA' | 'ELIMINADA'

export type BeneficiarySuggestionChanges = Record<string, { old: string | null; new: string | null }>

// Registro de auditoría de sugerencias. Sin llaves foráneas a propósito: debe sobrevivir
// al borrado de la sugerencia, del giro o del usuario.
@Entity()
@Index({ properties: ['userId', 'createdAt'] })
@Index({ properties: ['beneficiaryId', 'createdAt'] })
@Index({ properties: ['suggestionId'] })
export class BeneficiarySuggestionLog {
  @PrimaryKey({ type: 'string' })
  id: string = uuidv4()

  @Property({ type: 'string' })
  action!: BeneficiarySuggestionLogAction

  @Property({ type: 'string' })
  userId!: string

  @Property({ type: 'string', nullable: true })
  userEmail?: string

  @Property({ type: 'string', nullable: true })
  userRole?: string

  @Property({ type: 'string' })
  suggestionId!: string

  @Property({ type: 'string', nullable: true })
  giroId?: string

  @Property({ type: 'string' })
  executionType!: string

  @Property({ type: 'string' })
  beneficiaryId!: string

  // En pago móvil el nombre es el contacto que envía (o el teléfono), no un beneficiario real
  @Property({ type: 'string', nullable: true })
  beneficiaryName?: string

  @Property({ type: 'string', nullable: true })
  phone?: string

  // Solo para ACTUALIZADA: campo -> { old, new }
  @Property({ type: 'json', nullable: true })
  changes?: BeneficiarySuggestionChanges

  // Estado de la sugerencia después del evento (antes del borrado en ELIMINADA)
  @Property({ type: 'json', nullable: true })
  snapshot?: Record<string, string | null>

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt: Date = new Date()

  constructor(partial?: Partial<BeneficiarySuggestionLog>) {
    Object.assign(this, partial)
  }
}
