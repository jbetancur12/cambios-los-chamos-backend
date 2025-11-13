import { Migration } from '@mikro-orm/migrations';

export class Migration20251113151146_AddFeeToBankAccountTransaction extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "bank_account_transactions" add column "fee" numeric(10,2) not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bank_account_transactions" drop column "fee";`);
  }

}
