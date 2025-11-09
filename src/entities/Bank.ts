import { Entity, PrimaryKey, Property, Enum, OneToMany } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { BankTransaction } from './BankTransaction';

export enum Currency {
  VES = 'VES',
  COP = 'COP',
  USD = 'USD',
}

@Entity({ tableName: 'banks' })
export class Bank {
  @PrimaryKey()
  id: string = uuidv4();

  @Property()
  name!: string;

  @Enum(() => Currency)
  currency!: Currency;

  @Property({ type: 'decimal', default: 0 })
  currentBalance: number = 0;

  @OneToMany(() => BankTransaction, (tx) => tx.bank)
  transactions = new Array<BankTransaction>();
}
