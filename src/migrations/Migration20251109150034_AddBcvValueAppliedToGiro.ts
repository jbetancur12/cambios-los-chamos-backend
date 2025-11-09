import { Migration } from '@mikro-orm/migrations';

export class Migration20251109150034_AddBcvValueAppliedToGiro extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" add column "bcv_value_applied" numeric(10,0) not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop column "bcv_value_applied";`);
  }

}
