import { Entity, PrimaryKey, Property, ManyToOne, ManyToMany, Collection, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { ClientCategory } from './ClientCategory'
import { CobranzaRoute } from './CobranzaRoute'

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
  email?: string

  @Property({ nullable: true })
  address?: string

  @ManyToOne(() => ClientCategory, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  category?: ClientCategory

  @Property({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimitOverride?: number

  @Property({ type: 'int', nullable: true })
  maxCreditsOverride?: number

  @Property({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number

  @Property({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number

  @Property({ default: true })
  @Index()
  isActive: boolean = true

  @Property({ type: 'text', nullable: true })
  notes?: string

  @ManyToMany(() => CobranzaRoute, 'clients', { pivotTable: 'cobranza_route_clients', owner: true })
  routes = new Collection<CobranzaRoute>(this)

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
