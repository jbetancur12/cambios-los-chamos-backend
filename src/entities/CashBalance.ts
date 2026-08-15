import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index, Unique } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

export enum CashBalanceStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity({ tableName: 'cash_balances' })
@Unique({ properties: ['cobrador', 'date'] })
export class CashBalance {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  cobrador!: User

  @Property({ type: 'date' })
  @Index()
  date!: string

  @Property({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  initialAmount: number = 0

  @Property({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  collectedAmount: number = 0

  @Property({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  lentAmount: number = 0

  @Property({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  finalAmount: number = 0

  @Enum(() => CashBalanceStatus)
  status: CashBalanceStatus = CashBalanceStatus.OPEN

  @Property({ nullable: true })
  autoClosedAt?: Date

  @Property({ nullable: true })
  manuallyClosedAt?: Date

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null', updateRule: 'cascade' })
  closedBy?: User

  @Property({ type: 'text', nullable: true })
  closureNotes?: string

  @Property({ default: false })
  requiresReconciliation: boolean = false

  @Property({ default: false })
  hasPendingPreviousBoxes: boolean = false

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
