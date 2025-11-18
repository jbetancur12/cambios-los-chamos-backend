import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

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

  @Property({ type: 'string' })
  phone!: string

  @Property({ type: 'string' })
  bankId!: string

  @Property({ type: 'string' })
  accountNumber!: string

  @Property({ type: 'date', onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ type: 'date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  constructor(partial?: Partial<BeneficiarySuggestion>) {
    Object.assign(this, partial)
  }
}
