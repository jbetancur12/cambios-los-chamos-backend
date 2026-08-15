import { Entity, PrimaryKey, Property, ManyToOne, ManyToMany, Collection } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { CobranzaClient } from './CobranzaClient'

@Entity({ tableName: 'cobranza_routes' })
export class CobranzaRoute {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string

  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  cobrador!: User

  @ManyToMany(() => CobranzaClient, 'routes', { pivotTable: 'cobranza_route_clients', owner: false })
  clients = new Collection<CobranzaClient>(this)

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
