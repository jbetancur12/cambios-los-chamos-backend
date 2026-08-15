import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

@Entity({ tableName: 'interest_rates' })
export class InterestRate {
  @PrimaryKey()
  id: string = uuidv4()

  @Property({ nullable: true })
  name?: string

  @Property({ type: 'decimal', precision: 5, scale: 2 })
  rate!: number

  @Property({ default: true })
  @Index()
  isActive: boolean = true

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  createdBy?: User

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  updatedBy?: User

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
