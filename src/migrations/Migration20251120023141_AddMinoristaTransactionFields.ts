import { Migration } from '@mikro-orm/migrations';

export class Migration20251120023141_AddMinoristaTransactionFields extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column if not exists "previous_balance_in_favor" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column if not exists "current_balance_in_favor" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column if not exists "balance_in_favor_used" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column if not exists "remaining_balance" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column if not exists "external_debt" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column if not exists "description" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop column if exists "previous_balance_in_favor";`);
    this.addSql(`alter table "minorista_transactions" drop column if exists "current_balance_in_favor";`);
    this.addSql(`alter table "minorista_transactions" drop column if exists "balance_in_favor_used";`);
    this.addSql(`alter table "minorista_transactions" drop column if exists "remaining_balance";`);
    this.addSql(`alter table "minorista_transactions" drop column if exists "external_debt";`);
    this.addSql(`alter table "minorista_transactions" drop column if exists "description";`);
  }

}
