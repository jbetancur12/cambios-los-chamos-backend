import { Entity, PrimaryKey, Property, Unique, Opt } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'

@Entity({ tableName: 'customer_invoice_data' })
export class CustomerInvoiceData {
  @PrimaryKey()
  id: string = uuidv4()

  @Property()
  @Unique()
  identification!: string

  @Property({ nullable: true })
  dv?: string

  @Property()
  names!: string

  @Property()
  email!: string

  @Property()
  phone!: string

  @Property()
  address!: string

  @Property({ default: 980 })
  municipality_id: number & Opt = 980

  @Property({ nullable: true })
  municipality_name?: string

  @Property({ default: 21 })
  tribute_id: number & Opt = 21

  @Property({ onCreate: () => new Date() })
  createdAt: Date & Opt = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date & Opt = new Date()
}
