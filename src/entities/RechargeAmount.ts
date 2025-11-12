import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

@Entity({ tableName: 'recharge_amounts' })
export class RechargeAmount {
  @PrimaryKey()
  id: string = uuidv4()

  @Property({ type: 'decimal', precision: 15, scale: 2 })
  amountBs!: number // Monto en Bolívares

  @Property({ type: 'boolean', default: true })
  isActive: boolean = true

  @ManyToOne(() => User)
  createdBy!: User

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
