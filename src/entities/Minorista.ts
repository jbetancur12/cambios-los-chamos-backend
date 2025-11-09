import { Entity, PrimaryKey, Property, OneToOne, OneToMany } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';
import { MinoristaTransaction } from './MinoristaTransaction';
import { Giro } from './Giro';

@Entity({ tableName: 'minoristas' })
export class Minorista {
  @PrimaryKey()
   id: string = uuidv4();

  @OneToOne(() => User)
  user!: User;

  @Property({ type: 'decimal', default: 0 })
  balance: number = 0;

  @OneToMany(() => MinoristaTransaction, (tx) => tx.minorista)
  transactions = new Array<MinoristaTransaction>();

  @OneToMany(() => Giro, (g) => g.minorista)
  giros = new Array<Giro>();
}
