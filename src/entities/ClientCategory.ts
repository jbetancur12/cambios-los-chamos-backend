import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

@Entity({ tableName: 'client_categories' })
export class ClientCategory {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  @Index()
  code!: string

  @Property()
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ default: true })
  @Index()
  isActive: boolean = true

  @Property({ type: 'int', nullable: true })
  minOverdueCount?: number

  @Property({ type: 'int', nullable: true })
  maxOverdueCount?: number

  @Property({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxAmount?: number

  @Property({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  minAmount: number = 0

  @Property({ type: 'int', nullable: true })
  maxCredits?: number

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
