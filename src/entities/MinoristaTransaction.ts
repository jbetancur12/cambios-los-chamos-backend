import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Minorista } from './Minorista';
import { User } from './User';

export enum MinoristaTransactionType {
  RECHARGE = 'RECHARGE',
  DISCOUNT = 'DISCOUNT',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity({ tableName: 'minorista_transactions' })
export class MinoristaTransaction {
  @PrimaryKey()
  id: string = uuidv4();

  @ManyToOne(() => Minorista)
  minorista!: Minorista;

  @Property({ type: 'decimal' })
  amount!: number;

  @Enum(() => MinoristaTransactionType)
  type!: MinoristaTransactionType;

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
