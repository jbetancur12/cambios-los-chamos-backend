
import { Entity, PrimaryKey, Property, OneToMany, Cascade, Collection } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { ProductTransaction } from './ProductTransaction';
import { ProductPresentation } from './ProductPresentation';

@Entity({ tableName: 'products' })
export class Product {
    @PrimaryKey()
    id: string = uuidv4();

    @Property()
    name!: string;

    @Property({ nullable: true })
    sku?: string;

    @Property({ nullable: true, type: 'text' })
    description?: string;

    @Property({ default: 0 })
    stock: number = 0;

    @Property({ default: 5 })
    minStock: number = 5;

    @Property({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    costPrice: number = 0;

    @Property({ type: 'decimal', precision: 14, scale: 2, default: 0 })
    sellingPrice: number = 0;

    @Property({ nullable: true })
    imageUrl?: string;

    @Property({ default: true })
    isActive: boolean = true;

    @Property({ default: true })
    showInStore: boolean = true;

    @OneToMany(() => ProductTransaction, (tx) => tx.product)
    transactions = new Array<ProductTransaction>();

    @OneToMany(() => ProductPresentation, (pp) => pp.product, { cascade: [Cascade.ALL], orphanRemoval: true })
    presentations = new Collection<ProductPresentation>(this);

    @Property({ onCreate: () => new Date() })
    createdAt: Date = new Date();

    @Property({ onUpdate: () => new Date() })
    updatedAt: Date = new Date();
}
