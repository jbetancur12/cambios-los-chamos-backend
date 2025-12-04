import { Migration } from '@mikro-orm/migrations';

export class Migration20251204163702 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minoristas" add column "profit_percentage" numeric(5,4) not null default 0.05;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minoristas" drop column "profit_percentage";`);
  }

}
