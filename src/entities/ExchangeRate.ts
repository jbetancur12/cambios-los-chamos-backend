import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';

@Entity({ tableName: 'exchange_rates' })
export class ExchangeRate {
  @PrimaryKey()
  id: string = uuidv4();

  @Property({ type: 'decimal' })
  copToBs!: number;

  @Property({ type: 'decimal' })
  usdToBs!: number;

  @Property({ type: 'decimal' })
  bcvValue!: number;

  @ManyToOne(() => User)
  createdBy!: User;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();
}
