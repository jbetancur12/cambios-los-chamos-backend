import { Entity, PrimaryKey, Property, Enum } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

export enum OperatorType {
  MOVISTAR = 'MOVISTAR',
  DIGITEL = 'DIGITEL',
  INTER = 'INTER',
  OTRO = 'OTRO',
}

@Entity({ tableName: 'recharge_operators' })
export class RechargeOperator {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  name!: string

  @Enum(() => OperatorType)
  type!: OperatorType

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
