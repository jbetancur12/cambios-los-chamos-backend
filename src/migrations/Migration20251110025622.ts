import { Migration } from '@mikro-orm/migrations';

export class Migration20251110025622 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint if exists "minorista_transactions_type_check";`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_type_check" check("type" in ('RECHARGE', 'DISCOUNT', 'ADJUSTMENT', 'PROFIT'));`);

    this.addSql(`alter table "giros" add column "system_profit" numeric(10,0) not null default 0, add column "minorista_profit" numeric(10,0) not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint if exists "minorista_transactions_type_check";`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_type_check" check("type" in ('RECHARGE', 'DISCOUNT', 'ADJUSTMENT'));`);

    this.addSql(`alter table "giros" drop column "system_profit", drop column "minorista_profit";`);
  }

}
