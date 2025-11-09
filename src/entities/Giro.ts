import { Entity, PrimaryKey, Property, Enum, ManyToOne, Index } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { User } from './User';
import { Minorista } from './Minorista';
import { Transferencista } from './Transferencista';
import { ExchangeRate } from './ExchangeRate';
import { Currency } from './Bank';
import { BankAccount } from './BankAccount';

export enum GiroStatus {
  PENDIENTE = 'PENDIENTE',
  ASIGNADO = 'ASIGNADO',
  PROCESANDO = 'PROCESANDO',
  COMPLETADO = 'COMPLETADO',
  CANCELADO = 'CANCELADO',
}

export enum ExecutionType {
  TRANSFERENCIA = 'TRANSFERENCIA',
  PAGO_MOVIL = 'PAGO_MOVIL',
  EFECTIVO = 'EFECTIVO',
  ZELLE = 'ZELLE',
  OTROS = 'OTROS',
}

@Entity({ tableName: 'giros' })
export class Giro {
  @PrimaryKey()
  id: string = uuidv4();

  @ManyToOne(() => Minorista, { nullable: true })
  minorista?: Minorista;

  @ManyToOne(() => Transferencista, { nullable: true })
  transferencista?: Transferencista;

  @ManyToOne(() => ExchangeRate)
  rateApplied!: ExchangeRate;

  @Property()
  beneficiaryName!: string;

  @Property()
  beneficiaryId!: string;

  @Property()
  bankName!: string;

  @Property()
  accountNumber!: string;

  @Property()
  phone!: string;

  @Property({ type: 'decimal' })
  amountInput!: number;

  @Enum(() => Currency)
  currencyInput!: Currency; // COP o USD

  @Property({ type: 'decimal' })
  amountBs!: number;

  @Property({ type: 'decimal' })
  bcvValueApplied!: number;

  @Property({ type: 'decimal', nullable: true })
  commission?: number;

  @Enum(() => GiroStatus)
  @Index()
  status: GiroStatus = GiroStatus.PENDIENTE;

  @Property({ nullable: true })
  proofUrl?: string;

  @ManyToOne(() => BankAccount, { nullable: true })
  bankAccountUsed?: BankAccount;

  @Enum(() => ExecutionType)
  executionType?: ExecutionType;

  @ManyToOne(() => User)
  createdBy!: User;

  @Property({ onCreate: () => new Date() })
  @Index()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
