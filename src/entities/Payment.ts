import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { Credit } from './Credit'
import { CobranzaClient } from './CobranzaClient'

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  MOBILE_PAYMENT = 'mobile_payment',
}

export enum PaymentStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity({ tableName: 'payments' })
export class Payment {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Credit, { deleteRule: 'cascade', updateRule: 'cascade' })
  credit!: Credit

  @ManyToOne(() => CobranzaClient, { deleteRule: 'cascade', updateRule: 'cascade' })
  client!: CobranzaClient

  @Property({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number

  @Property()
  @Index()
  paymentDate!: Date

  @Enum(() => PaymentMethod)
  paymentMethod!: PaymentMethod

  @Enum(() => PaymentStatus)
  status: PaymentStatus = PaymentStatus.COMPLETED

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  receivedBy?: User

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
