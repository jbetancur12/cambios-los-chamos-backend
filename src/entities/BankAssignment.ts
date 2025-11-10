import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Transferencista } from './Transferencista'
import { Bank } from './Bank'

@Entity({ tableName: 'bank_assignments' })
export class BankAssignment {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Bank, { deleteRule: 'restrict', updateRule: 'cascade' })
  @Index()
  bank!: Bank

  @ManyToOne(() => Transferencista, { deleteRule: 'cascade', updateRule: 'cascade' })
  transferencista!: Transferencista

  @Property({ default: true })
  @Index()
  isActive: boolean = true

  @Property({ default: 0 })
  priority: number = 0 // Mayor número = mayor prioridad en asignación automática

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
