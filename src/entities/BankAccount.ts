import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Transferencista } from './Transferencista'
import { Bank } from './Bank'

export enum AccountType {
  AHORROS = 'AHORROS',
  CORRIENTE = 'CORRIENTE',
}

export enum BankAccountOwnerType {
  TRANSFERENCISTA = 'TRANSFERENCISTA',
  ADMIN = 'ADMIN',
}

@Entity({ tableName: 'bank_accounts' })
export class BankAccount {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Transferencista, { deleteRule: 'cascade', updateRule: 'cascade', nullable: true })
  transferencista: Transferencista | null = null

  @Enum(() => BankAccountOwnerType)
  @Index()
  ownerType!: BankAccountOwnerType

  @Property({ nullable: true })
  @Index()
  ownerId?: string

  @ManyToOne(() => Bank, { deleteRule: 'restrict', updateRule: 'cascade' })
  bank!: Bank

  @Property({ nullable: true })
  accountNumber?: string

  @Property()
  accountHolder!: string

  @Enum(() => AccountType)
  @Property({ nullable: true })
  accountType?: AccountType

  @Property({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  balance: number = 0

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
