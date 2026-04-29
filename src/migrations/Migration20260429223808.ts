import { Migration } from '@mikro-orm/migrations';

export class Migration20260429223808 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "product_transactions" add column "status" text check ("status" in ('PENDING', 'COMPLETED')) not null default 'COMPLETED';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "product_transactions" drop column "status";`);
  }

}
