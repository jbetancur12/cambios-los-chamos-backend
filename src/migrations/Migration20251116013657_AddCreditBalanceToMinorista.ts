import { Migration } from '@mikro-orm/migrations';

export class Migration20251116013657_AddCreditBalanceToMinorista extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minoristas" add column "credit_balance" numeric(10,0) not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minoristas" drop column "credit_balance";`);
  }

}
