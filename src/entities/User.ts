import { Entity, PrimaryKey, Property, Enum, Unique, OneToOne, Index } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Minorista } from './Minorista'
import { Transferencista } from './Transferencista'

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MINORISTA = 'MINORISTA',
  TRANSFERENCISTA = 'TRANSFERENCISTA',
}

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  fullName!: string

  @Property()
  @Unique()
  email!: string

  @Property({ hidden: true })
  password!: string

  @Enum(() => UserRole)
  @Index()
  role!: UserRole

  @Property({ type: 'boolean', default: true })
  @Index()
  isActive: boolean = true

  @Property({ default: false })
  emailVerified: boolean = false

  @OneToOne(() => Minorista, (minorista) => minorista.user)
  minorista?: Minorista

  @OneToOne(() => Transferencista, (t) => t.user, { nullable: true })
  transferencista?: Transferencista

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
