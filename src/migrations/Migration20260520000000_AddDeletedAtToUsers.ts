import { Migration } from '@mikro-orm/migrations';

export class Migration20260520000000_AddDeletedAtToUsers extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "users" add column "deleted_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop column "deleted_at";`);
  }

}
