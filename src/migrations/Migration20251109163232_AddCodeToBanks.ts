import { Migration } from '@mikro-orm/migrations';

export class Migration20251109163232_AddCodeToBanks extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "banks" drop column "current_balance";`);

    this.addSql(`alter table "banks" add column "code" int not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "banks" drop column "code";`);

    this.addSql(`alter table "banks" add column "current_balance" numeric(10,0) not null default 0;`);
  }

}
