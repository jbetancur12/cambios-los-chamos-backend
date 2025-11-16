import { Migration } from '@mikro-orm/migrations';

export class Migration20251116050827_AddBalanceTrackingToMinoristaTransaction extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column "balance_in_favor_used" numeric(10,0) null, add column "credit_used" numeric(10,0) null, add column "remaining_balance" numeric(10,0) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop column "balance_in_favor_used", drop column "credit_used", drop column "remaining_balance";`);
  }

}
