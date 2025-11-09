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

  @ManyToOne(() => BankAccount)
  bankAccount!: BankAccount

  @Property({ type: 'decimal' })
  amount!: number

  @Enum(() => BankAccountTransactionType)
  type!: BankAccountTransactionType

  @Property({ type: 'decimal' })
  previousBalance!: number

  @Property({ type: 'decimal' })
  currentBalance!: number

  @Property({ nullable: true })
  reference?: string // Referencia opcional (ej: ID del giro)

  @ManyToOne(() => User)
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()
}
