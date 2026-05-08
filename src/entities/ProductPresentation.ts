
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core'
import { v4 as uuidv4 } from 'uuid'
import { Product } from './Product'

@Entity({ tableName: 'product_presentations' })
export class ProductPresentation {
  @PrimaryKey()
  id: string = uuidv4()

  @ManyToOne(() => Product, { inversedBy: (p: Product) => p.presentations, deleteRule: 'cascade' })
  product!: Product

  @Property()
  name!: string

  @Property()
  quantity!: number

  @Property({ type: 'decimal', precision: 14, scale: 2 })
  sellingPrice!: number

  @Property({ default: true })
  showInStore: boolean = true

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
