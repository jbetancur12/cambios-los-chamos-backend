import { Migration } from '@mikro-orm/migrations';

export class Migration20251113023919 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minoristas" drop column "balance";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minoristas" add column "balance" numeric(10,0) not null default 0;`);
  }

}
