import { Entity, PrimaryKey, Property, Enum, ManyToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Transferencista } from './Transferencista'
import { Bank } from './Bank'

export enum AccountType {
  AHORROS = 'AHORROS',
  CORRIENTE = 'CORRIENTE',
}

@Entity({ tableName: 'bank_accounts' })
export class BankAccount {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Transferencista, { deleteRule: 'cascade', updateRule: 'cascade' })
  transferencista!: Transferencista

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
}
