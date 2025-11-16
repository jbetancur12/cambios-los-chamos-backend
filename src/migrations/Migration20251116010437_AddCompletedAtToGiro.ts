import { Migration } from '@mikro-orm/migrations';

export class Migration20251116010437_AddCompletedAtToGiro extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" add column "completed_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop column "completed_at";`);
  }

}
