import { Entity, PrimaryKey, Property, Enum } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

export enum Currency {
  VES = 'VES',
  COP = 'COP',
  USD = 'USD',
}

@Entity({ tableName: 'banks' })
export class Bank {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  name!: string

  @Enum(() => Currency)
  currency!: Currency

  @Property()
  code!: number

  // @OneToMany(() => BankTransaction, (tx) => tx.bank)
  // transactions = new Array<BankTransaction>()
}
