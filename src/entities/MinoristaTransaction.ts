import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index, OneToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Minorista } from './Minorista'
import { User } from './User'
import { Giro } from './Giro'

export enum MinoristaTransactionType {
  RECHARGE = 'RECHARGE', // Recarga de saldo
  DISCOUNT = 'DISCOUNT', // Descuento por giro
  ADJUSTMENT = 'ADJUSTMENT', // Ajuste manual
  PROFIT = 'PROFIT', // Ganancia de giro (50%)
}

@Entity({ tableName: 'minorista_transactions' })
export class MinoristaTransaction {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Minorista, { deleteRule: 'cascade', updateRule: 'cascade' })
  minorista!: Minorista

  @Property({ type: 'decimal' })
  amount!: number

  @Enum(() => MinoristaTransactionType)
  type!: MinoristaTransactionType

    @Property({ type: 'decimal' })
  previousAvailableCredit!: number

  @Property({ type: 'decimal' })
  availableCredit!: number

  // @Property({ type: 'decimal' })
  // previousBalance!: number

  // @Property({ type: 'decimal' })
  // currentBalance!: number

  @OneToOne(() => Giro, { nullable: true, deleteRule: 'restrict', updateRule: 'cascade' })
  giro?: Giro

  @Property({ type: 'decimal', nullable: true })
  creditConsumed?: number // Cupo consumido en este giro

  @Property({ type: 'decimal', nullable: true })
  profitEarned?: number // Ganancia generada por este giro

  @Property({ type: 'decimal', nullable: true })
  accumulatedDebt?: number // Deuda acumulada después de esta transacción
  
  @Property({ type: 'decimal', nullable: true })
  accumulatedProfit?: number // Ganancia Acumulada depues de esta tranasaccion

  @Property({ nullable: true })
  description?: string // Descripción clara de la transacción

  @ManyToOne(() => User, { deleteRule: 'restrict', updateRule: 'cascade' })
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()
}
