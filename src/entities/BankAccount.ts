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
  transferencista?: Transferencista

  @Enum(() => BankAccountOwnerType)
  @Index()
  ownerType!: BankAccountOwnerType

  @Property({ nullable: true })
  @Index()
  ownerId?: string

  @ManyToOne(() => Bank, { deleteRule: 'restrict', updateRule: 'cascade' })
  bank!: Bank

  @Property()
  accountNumber!: string

  @Property()
  accountHolder!: string

  @Enum(() => AccountType)
  accountType?: AccountType

  @Property({ type: 'decimal', default: 0 })
  balance: number = 0

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
