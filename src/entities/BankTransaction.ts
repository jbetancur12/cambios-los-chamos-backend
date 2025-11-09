import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Bank } from './Bank';
import { User } from './User';

export enum BankTransactionType {
  RECHARGE = 'RECHARGE',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity({ tableName: 'bank_transactions' })
export class BankTransaction {
  @PrimaryKey()
  id: string = uuidv4();

  @ManyToOne(() => Bank)
  bank!: Bank;

  @Property({ type: 'decimal' })
  amount!: number;

  @Enum(() => BankTransactionType)
  type!: BankTransactionType;

  @Property({ type: 'decimal', nullable: true })
  commission?: number;

  @Property({ type: 'decimal' })
  previousBalance!: number;

  @Property({ type: 'decimal' })
  currentBalance!: number;

  @ManyToOne(() => User)
  createdBy!: User;

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date();
}
