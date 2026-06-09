import { Migration } from '@mikro-orm/migrations';

export class Migration20260218024946 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "product_transactions" add column "remaining_quantity" int not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "product_transactions" drop column "remaining_quantity";`);
  }

}
