import { Migration } from '@mikro-orm/migrations';

export class Migration20251211150746 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" alter column "amount_input" type numeric(18,2) using ("amount_input"::numeric(18,2));`);
    this.addSql(`alter table "giros" alter column "amount_bs" type numeric(18,2) using ("amount_bs"::numeric(18,2));`);
    this.addSql(`alter table "giros" alter column "bcv_value_applied" type numeric(18,2) using ("bcv_value_applied"::numeric(18,2));`);
    this.addSql(`alter table "giros" alter column "commission" type numeric(18,2) using ("commission"::numeric(18,2));`);
    this.addSql(`alter table "giros" alter column "system_profit" type numeric(18,2) using ("system_profit"::numeric(18,2));`);
    this.addSql(`alter table "giros" alter column "minorista_profit" type numeric(18,2) using ("minorista_profit"::numeric(18,2));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" alter column "amount_input" type numeric(10,0) using ("amount_input"::numeric(10,0));`);
    this.addSql(`alter table "giros" alter column "amount_bs" type numeric(10,0) using ("amount_bs"::numeric(10,0));`);
    this.addSql(`alter table "giros" alter column "bcv_value_applied" type numeric(10,0) using ("bcv_value_applied"::numeric(10,0));`);
    this.addSql(`alter table "giros" alter column "commission" type numeric(10,0) using ("commission"::numeric(10,0));`);
    this.addSql(`alter table "giros" alter column "system_profit" type numeric(10,0) using ("system_profit"::numeric(10,0));`);
    this.addSql(`alter table "giros" alter column "minorista_profit" type numeric(10,0) using ("minorista_profit"::numeric(10,0));`);
  }

}
