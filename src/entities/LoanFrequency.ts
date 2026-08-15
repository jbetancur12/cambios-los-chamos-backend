import { Entity, PrimaryKey, Property, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

@Entity({ tableName: 'loan_frequencies' })
export class LoanFrequency {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  @Index()
  code!: string

  @Property()
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string

  @Property({ default: true })
  @Index()
  isEnabled: boolean = true

  @Property({ default: false })
  isFixedDuration: boolean = false

  @Property({ type: 'int', nullable: true })
  fixedInstallments?: number

  @Property({ type: 'int', nullable: true })
  fixedDurationDays?: number

  @Property({ type: 'int' })
  periodDays!: number

  @Property({ type: 'int', nullable: true })
  defaultInstallments?: number

  @Property({ type: 'int', nullable: true })
  minInstallments?: number

  @Property({ type: 'int', nullable: true })
  maxInstallments?: number

  @Property({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  interestRate?: number

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
