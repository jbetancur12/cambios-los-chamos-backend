import { Migration } from '@mikro-orm/migrations';

export class Migration20251126150026_MakeBankAccountFieldsNullable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "bank_accounts" alter column "account_number" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bank_accounts" alter column "account_number" set not null;`);
  }

}
