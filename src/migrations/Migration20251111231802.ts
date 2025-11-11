import { Migration } from '@mikro-orm/migrations';

export class Migration20251111231802 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "transferencista_assignment_tracker" ("id" serial primary key, "last_assigned_index" int not null default 0, "updated_at" timestamptz not null);`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "transferencista_assignment_tracker" cascade;`);
  }

}
