import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { Credit } from './Credit'
import { CobranzaClient } from './CobranzaClient'
import { CashBalance } from './CashBalance'

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CARD = 'card',
  MOBILE_PAYMENT = 'mobile_payment',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PARTIAL = 'partial',
}

export enum PaymentType {
  REGULAR = 'regular',
  DOWN_PAYMENT = 'down_payment',
  EXTRA = 'extra',
}

@Entity({ tableName: 'payments' })
export class Payment {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Credit, { deleteRule: 'cascade', updateRule: 'cascade' })
  credit!: Credit

  @ManyToOne(() => CobranzaClient, { deleteRule: 'cascade', updateRule: 'cascade' })
  client!: CobranzaClient

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  cobrador?: User

  @ManyToOne(() => CashBalance, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  cashBalance?: CashBalance

  @Property({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number

  @Property({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  accumulatedAmount?: number

  @Property()
  @Index()
  paymentDate!: Date

  @Enum(() => PaymentMethod)
  paymentMethod!: PaymentMethod

  @Enum(() => PaymentType)
  paymentType: PaymentType = PaymentType.REGULAR

  @Property({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number

  @Property({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number

  @Enum(() => PaymentStatus)
  status: PaymentStatus = PaymentStatus.PENDING

  @Property({ nullable: true })
  transactionId?: string

  @Property({ type: 'int', nullable: true })
  installmentNumber?: number

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  receivedBy?: User

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
