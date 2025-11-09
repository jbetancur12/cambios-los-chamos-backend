import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Transferencista } from './Transferencista';

@Entity({ tableName: 'bank_assignments' })
export class BankAssignment {
  @PrimaryKey()
  id: string = uuidv4();

  @Property()
  @Index()
  destinationBankName!: string; // Nombre del banco destino (ej: "Banco de Venezuela")

  @ManyToOne(() => Transferencista)
  transferencista!: Transferencista;

  @Property({ default: true })
  @Index()
  isActive: boolean = true;

  @Property({ default: 0 })
  priority: number = 0; // Mayor número = mayor prioridad en asignación automática

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
