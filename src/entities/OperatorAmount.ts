import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { RechargeOperator } from './RechargeOperator'
import { RechargeAmount } from './RechargeAmount'

@Entity({ tableName: 'operator_amounts' })
export class OperatorAmount {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => RechargeOperator, { deleteRule: 'cascade' })
  operator!: RechargeOperator

  @ManyToOne(() => RechargeAmount, { deleteRule: 'cascade' })
  amount!: RechargeAmount

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
