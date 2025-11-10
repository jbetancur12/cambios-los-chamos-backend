import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

@Entity({ tableName: 'exchange_rates' })
export class ExchangeRate {
  @PrimaryKey()
  id: string = uuidv4()

  @Property({ type: 'decimal' })
  buyRate!: number

  @Property({ type: 'decimal' })
  sellRate!: number

  @Property({ type: 'decimal' })
  usd!: number

  @Property({ type: 'decimal' })
  bcv!: number

  @ManyToOne(() => User)
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()
}
