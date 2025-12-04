import { Entity, PrimaryKey, Property } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

@Entity({ tableName: 'recharge_operators' })
export class RechargeOperator {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  name!: string

  @Property({ default: 0 })
  code!: number

  @Property({ type: 'varchar' })
  type!: string

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
