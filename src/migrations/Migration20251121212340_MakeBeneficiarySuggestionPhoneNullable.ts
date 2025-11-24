import { Migration } from '@mikro-orm/migrations';

export class Migration20251121212340_MakeBeneficiarySuggestionPhoneNullable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "beneficiary_suggestion" alter column "phone" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "beneficiary_suggestion" alter column "phone" set not null;`);
  }

}
