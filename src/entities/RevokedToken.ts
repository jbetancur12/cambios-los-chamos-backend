import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core'

// Tokens de acceso cerrados con logout. Se guarda el hash sha256 (nunca el token) y la fecha en que el
// JWT vence, porque pasada esa fecha la fila ya no sirve y se puede borrar.
@Entity()
export class RevokedToken {
  @PrimaryKey({ type: 'string' })
  tokenHash!: string

  @Property({ type: 'Date' })
  @Index()
  expiresAt!: Date

  @Property({ type: 'Date' })
  revokedAt: Date = new Date()
}
