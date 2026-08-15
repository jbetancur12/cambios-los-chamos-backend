import { Entity, PrimaryKey, Property, Enum, ManyToOne, OneToMany, Collection, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { CobranzaClient } from './CobranzaClient'
import { CashBalance } from './CashBalance'
import { Payment } from './Payment'

export enum CreditFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

export enum CreditStatus {
  PENDING_APPROVAL = 'pending_approval',
  WAITING_DELIVERY = 'waiting_delivery',
  ACTIVE = 'active',
  PAID_OFF = 'paid_off',
  DEFAULTED = 'defaulted',
  CANCELLED = 'cancelled',
}

@Entity({ tableName: 'credits' })
export class Credit {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => CobranzaClient, { deleteRule: 'cascade', updateRule: 'cascade' })
  client!: CobranzaClient

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  cobrador?: User

  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  createdBy!: User

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  approvedBy?: User

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  deliveredBy?: User

  @ManyToOne(() => CashBalance, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  cashBalance?: CashBalance

  @Property({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number

  @Property({ type: 'decimal', precision: 15, scale: 2 })
  balance!: number

  @Property()
  @Index()
  frequency!: CreditFrequency

  @Property({ type: 'date' })
  @Index()
  startDate!: string

  @Property({ type: 'date', nullable: true })
  endDate?: string

  @Enum(() => CreditStatus)
  @Index()
  status: CreditStatus = CreditStatus.PENDING_APPROVAL

  @Property({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  interestRate: number = 0

  @Property({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalAmount?: number

  @Property({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  installmentAmount?: number

  @Property({ type: 'int', nullable: true })
  totalInstallments?: number

  @Property({ type: 'int', default: 0 })
  paidInstallmentsCount: number = 0

  @Property({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPaid: number = 0

  @Property({ nullable: true })
  scheduledDeliveryDate?: Date

  @Property({ nullable: true })
  approvedAt?: Date

  @Property({ nullable: true })
  deliveredAt?: Date

  @Property({ type: 'text', nullable: true })
  deliveryNotes?: string

  @Property({ type: 'text', nullable: true })
  rejectionReason?: string

  @Property({ default: false })
  immediateDeliveryRequested: boolean = false

  @Property({ default: false })
  isLegacyCredit: boolean = false

  @Property({ default: false })
  isCustomCredit: boolean = false

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  downPayment?: number

  @Property({ default: false })
  calcOnRemainingAmount: boolean = false

  @Property({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number

  @Property({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number

  @Property({ default: false })
  firstPaymentToday: boolean = false

  @Property({ nullable: true })
  completedAt?: Date

  @OneToMany(() => Payment, (payment) => payment.credit)
  payments = new Collection<Payment>(this)

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
