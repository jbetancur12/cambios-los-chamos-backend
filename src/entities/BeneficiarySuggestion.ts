import { Entity, PrimaryKey, Property, ManyToOne, Index, Enum } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'
import { ExecutionType } from './Giro'

@Entity()
@Index({ properties: ['user', 'createdAt'], type: 'BTREE' })
export class BeneficiarySuggestion {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4()

  @ManyToOne(() => User, { deleteRule: 'cascade', updateRule: 'cascade' })
  user!: User

  @Property({ type: 'string' })
  beneficiaryName!: string

  @Property({ type: 'string' })
  beneficiaryId!: string

  @Property({ type: 'string', nullable: true })
  phone?: string

  @Property({ type: 'string' })
  bankId!: string

  @Property({ type: 'string' })
  accountNumber!: string

  @Enum(() => ExecutionType)
  executionType!: ExecutionType

  @Property({ type: 'date', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ type: 'date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  constructor(partial?: Partial<BeneficiarySuggestion>) {
    Object.assign(this, partial)
  }
}
