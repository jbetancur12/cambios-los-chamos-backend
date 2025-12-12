import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { BankAccount } from './BankAccount'
import { User } from './User'

export enum BankAccountTransactionType {
  DEPOSIT = 'DEPOSIT', // Depósito a la cuenta
  WITHDRAWAL = 'WITHDRAWAL', // Retiro de la cuenta (ej: ejecución de giro)
  ADJUSTMENT = 'ADJUSTMENT', // Ajuste manual
}

@Entity({ tableName: 'bank_account_transactions' })
export class BankAccountTransaction {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => BankAccount, { deleteRule: 'cascade', updateRule: 'cascade' })
  bankAccount!: BankAccount

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  amount!: number

  @Property({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fee!: number

  @Enum(() => BankAccountTransactionType)
  type!: BankAccountTransactionType

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  previousBalance!: number

  @Property({ type: 'decimal', precision: 18, scale: 2 })
  currentBalance!: number

  @Property({ nullable: true })
  reference?: string // Referencia opcional (ej: ID del giro)

  @ManyToOne(() => User, { deleteRule: 'restrict', updateRule: 'cascade' })
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()
}
