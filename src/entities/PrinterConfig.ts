import { Entity, PrimaryKey, Property, ManyToOne, Index, Unique } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { User } from './User'

export enum PrinterType {
  THERMAL = 'thermal',
  INJECTION = 'injection',
}

@Entity({ tableName: 'printer_configs' })
@Unique({ properties: ['user'] })
export class PrinterConfig {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  @Index()
  user!: User

  @Property()
  name!: string

  @Property({ type: 'string' })
  type!: PrinterType

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
