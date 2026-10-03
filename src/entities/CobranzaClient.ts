import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

@Entity({ tableName: 'cobranza_clients' })
export class CobranzaClient {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  name!: string

  @Property()
  @Index()
  identification!: string

  @Property({ nullable: true })
  phone?: string

  @Property({ nullable: true })
  address?: string

  @Property({ default: true })
  @Index()
  isActive: boolean = true

  @Property({ type: 'text', nullable: true })
  notes?: string

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
