import { Migration } from '@mikro-orm/migrations';

export class Migration20251109215643 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "bank_transactions" drop constraint if exists "bank_transactions_type_check";`);

    this.addSql(`alter table "bank_transactions" drop column "commission", drop column "previous_balance", drop column "current_balance";`);

    this.addSql(`alter table "bank_transactions" add column "description" text null, add column "reference" varchar(255) null;`);
    this.addSql(`alter table "bank_transactions" add constraint "bank_transactions_type_check" check("type" in ('INFLOW', 'OUTFLOW', 'NOTE'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bank_transactions" drop constraint if exists "bank_transactions_type_check";`);

    this.addSql(`alter table "bank_transactions" drop column "description", drop column "reference";`);

    this.addSql(`alter table "bank_transactions" add column "commission" numeric(10,0) null, add column "previous_balance" numeric(10,0) not null, add column "current_balance" numeric(10,0) not null;`);
    this.addSql(`alter table "bank_transactions" add constraint "bank_transactions_type_check" check("type" in ('RECHARGE', 'TRANSFER', 'ADJUSTMENT'));`);
  }

}
