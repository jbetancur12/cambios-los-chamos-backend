import { Entity, PrimaryKey, Property, OneToOne, OneToMany } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { BankAccount } from './BankAccount'
import { Giro } from './Giro'

@Entity({ tableName: 'transferencistas' })
export class Transferencista {
  @PrimaryKey()
  id: string = uuidv4()

  @OneToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  user!: User

  @Property({ default: true })
  available: boolean = true

  @OneToMany(() => BankAccount, (ba) => ba.transferencista)
  bankAccounts = new Array<BankAccount>()

  @OneToMany(() => Giro, (g) => g.transferencista)
  giros = new Array<Giro>()
}
