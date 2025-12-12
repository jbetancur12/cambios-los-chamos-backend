import { Entity, PrimaryKey, Property, OneToOne, OneToMany } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { MinoristaTransaction } from './MinoristaTransaction'
import { Giro } from './Giro'

@Entity({ tableName: 'minoristas' })
export class Minorista {
  @PrimaryKey()
  id: string = uuidv4()

  @OneToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  user!: User

  // @Property({ type: 'decimal', default: 0 })
  // balance: number = 0

  @Property({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  creditLimit: number = 0

  @Property({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  availableCredit: number = 0

  @Property({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  creditBalance: number = 0

  @Property({ type: 'decimal', precision: 5, scale: 4, default: 0.05 })
  profitPercentage: number = 0.05

  @OneToMany(() => MinoristaTransaction, (tx) => tx.minorista)
  transactions = new Array<MinoristaTransaction>()

  @OneToMany(() => Giro, (g) => g.minorista)
  giros = new Array<Giro>()
}
