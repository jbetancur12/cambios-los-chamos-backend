import { Entity, PrimaryKey, Property, Enum, ManyToOne, OneToMany, Collection, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { CobranzaClient } from './CobranzaClient'
import { Payment } from './Payment'

export enum CreditFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

// "En mora" no es un estado: se deriva del cronograma (cuotas vencidas sin pagar).
export enum CreditStatus {
  ACTIVE = 'active',
  PAID_OFF = 'paid_off',
  CANCELLED = 'cancelled',
}

@Entity({ tableName: 'credits' })
export class Credit {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => CobranzaClient, { deleteRule: 'cascade', updateRule: 'cascade' })
  client!: CobranzaClient

  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  createdBy!: User

  // Capital prestado
  @Property({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number

  // Saldo pendiente (totalAmount - totalPaid)
  @Property({ type: 'decimal', precision: 15, scale: 2 })
  balance!: number

  @Property({ type: 'text' })
  @Index()
  frequency!: CreditFrequency

  // Fecha de la primera cuota (fecha del préstamo + un periodo)
  @Property({ type: 'date' })
  @Index()
  startDate!: string

  // Fecha de la última cuota
  @Property({ type: 'date', nullable: true })
  endDate?: string

  @Enum(() => CreditStatus)
  @Index()
  status: CreditStatus = CreditStatus.ACTIVE

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

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ nullable: true })
  completedAt?: Date

  @OneToMany(() => Payment, (payment) => payment.credit)
  payments = new Collection<Payment>(this)

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
