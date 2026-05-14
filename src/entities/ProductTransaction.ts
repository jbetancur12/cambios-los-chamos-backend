
import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Product } from './Product';
import { User } from './User';

export enum ProductTransactionType {
    PURCHASE = 'PURCHASE', // Buy stock (Increase)
    SALE = 'SALE',         // Sell stock (Decrease)
    ADJUSTMENT = 'ADJUSTMENT', // Manual fix (Increase or Decrease)
}

export enum TransactionStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
}

export enum PaymentMethod {
    CASH = 'CASH',
    TRANSFER = 'TRANSFER',
    CARD = 'CARD',
    CREDIT = 'CREDIT'
}

@Entity({ tableName: 'product_transactions' })
export class ProductTransaction {
    @PrimaryKey()
    id: string = uuidv4();

    @ManyToOne(() => Product)
    product!: Product;

    @Enum(() => ProductTransactionType)
    type!: ProductTransactionType;

    @Enum({ items: () => TransactionStatus, default: TransactionStatus.COMPLETED })
    status: TransactionStatus = TransactionStatus.COMPLETED;

    @Enum({ items: () => PaymentMethod, nullable: true })
    paymentMethod?: PaymentMethod;

    @Property({ type: 'varchar', length: 255, nullable: true })
    clientName?: string;

    @Property({ nullable: true })
    presentationId?: string;

    @Property({ nullable: true })
    presentationName?: string;

    @Property({ nullable: true })
    presentationQuantity?: number;

    @Property()
    quantity!: number; // Always positive. Type determines + or - in logic.

    @Property({ default: 0 })
    remainingQuantity: number = 0; // For FIFO: Track how much of this batch is left.

    @Property({ type: 'decimal', precision: 14, scale: 2 })
    pricePerUnit!: number; // Cost if PURCHASE, Selling Price if SALE

    @Property({ type: 'decimal', precision: 14, scale: 2 })
    totalPrice!: number; // quantity * pricePerUnit

    @Property({ type: 'decimal', precision: 14, scale: 2, nullable: true })
    profit?: number; // Only for SALE: totalPrice - (quantity * product.costPrice)

    @ManyToOne(() => User)
    createdBy!: User;

    @Property({ onCreate: () => new Date() })
    createdAt: Date = new Date();
}
