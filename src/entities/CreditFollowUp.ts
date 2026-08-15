import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Credit } from './Credit'
import { User } from './User'

@Entity({ tableName: 'credit_follow_ups' })
export class CreditFollowUp {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Credit, { deleteRule: 'cascade', updateRule: 'cascade' })
  credit!: Credit

  @Property({ type: 'text' })
  note!: string

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  createdBy?: User

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
