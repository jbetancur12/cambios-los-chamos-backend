import { Migration } from '@mikro-orm/migrations';

export class Migration20260218031242 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "products" add column "min_stock" int not null default 5;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "products" drop column "min_stock";`);
  }

}
