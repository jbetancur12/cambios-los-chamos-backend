import { Migration } from '@mikro-orm/migrations';

export class Migration20251212183658 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" add column "status" text check ("status" in ('PENDING', 'COMPLETED', 'CANCELLED')) not null default 'COMPLETED';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop column "status";`);
  }

}
