import { Migration } from '@mikro-orm/migrations';

export class Migration20251120023141_AddMinoristaTransactionFields extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column "previous_balance_in_favor" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column "current_balance_in_favor" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column "balance_in_favor_used" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column "remaining_balance" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column "external_debt" numeric(19,2) null;`);
    this.addSql(`alter table "minorista_transactions" add column "description" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop column "previous_balance_in_favor";`);
    this.addSql(`alter table "minorista_transactions" drop column "current_balance_in_favor";`);
    this.addSql(`alter table "minorista_transactions" drop column "balance_in_favor_used";`);
    this.addSql(`alter table "minorista_transactions" drop column "remaining_balance";`);
    this.addSql(`alter table "minorista_transactions" drop column "external_debt";`);
    this.addSql(`alter table "minorista_transactions" drop column "description";`);
  }

}
