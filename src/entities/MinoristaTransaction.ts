import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Minorista } from './Minorista'
import { User } from './User'
import { Giro } from './Giro'

export enum MinoristaTransactionType {
  RECHARGE = 'RECHARGE', // Recarga de saldo
  DISCOUNT = 'DISCOUNT', // Descuento por giro (incluye profit del 5%)
  ADJUSTMENT = 'ADJUSTMENT', // Ajuste manual
  REFUND = 'REFUND', // Reembolso por devolución o eliminación de giro
}

@Entity({ tableName: 'minorista_transactions' })
export class MinoristaTransaction {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Minorista, { deleteRule: 'cascade', updateRule: 'cascade' })
  minorista!: Minorista

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number

  @Enum(() => MinoristaTransactionType)
  type!: MinoristaTransactionType

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  previousAvailableCredit!: number

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  availableCredit!: number

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  previousBalanceInFavor?: number // Saldo a favor antes de esta transacción

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  currentBalanceInFavor?: number // Saldo a favor después de esta transacción

  @ManyToOne(() => Giro, { nullable: true, deleteRule: 'cascade', updateRule: 'cascade' })
  giro?: Giro

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditConsumed?: number // Cupo consumido en este giro

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  profitEarned?: number // Ganancia generada por este giro

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  accumulatedDebt?: number // Deuda acumulada después de esta transacción

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  accumulatedProfit?: number // Ganancia Acumulada depues de esta tranasaccion

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  balanceInFavorUsed?: number // Saldo a favor usado en este descuento

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditUsed?: number // Crédito disponible usado en este descuento

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  remainingBalance?: number // Saldo a favor restante después de esta transacción

  @Property({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  externalDebt?: number // Deuda externa cuando se excede el crédito disponible

  @Property({ nullable: true })
  description?: string // Descripción clara de la transacción

  @ManyToOne(() => User, { deleteRule: 'restrict', updateRule: 'cascade' })
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()
}
