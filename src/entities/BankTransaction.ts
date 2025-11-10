import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Bank } from './Bank'
import { User } from './User'

export enum BankTransactionType {
  INFLOW = 'INFLOW', // Entrada de dinero al sistema (ej: recarga desde casa matriz)
  OUTFLOW = 'OUTFLOW', // Salida de dinero del sistema
  NOTE = 'NOTE', // Nota administrativa sin movimiento
}

/**
 * BankTransaction es solo para tracking administrativo
 * NO modifica ningún balance. Solo registra eventos relacionados con bancos.
 */
@Entity({ tableName: 'bank_transactions' })
export class BankTransaction {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Bank, { deleteRule: 'restrict', updateRule: 'cascade' })
  bank!: Bank

  @Property({ type: 'decimal' })
  amount!: number

  @Enum(() => BankTransactionType)
  type!: BankTransactionType

  @Property({ type: 'text', nullable: true })
  description?: string // Descripción del evento

  @Property({ nullable: true })
  reference?: string // Referencia opcional

  @ManyToOne(() => User, { deleteRule: 'restrict', updateRule: 'cascade' })
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()
}
