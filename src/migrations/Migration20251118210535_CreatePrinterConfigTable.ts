import { Migration } from '@mikro-orm/migrations';

export class Migration20251118210535_CreatePrinterConfigTable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "printer_configs" ("id" varchar(255) not null, "user_id" varchar(255) not null, "name" varchar(255) not null, "type" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "printer_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "printer_configs_user_id_index" on "printer_configs" ("user_id");`);
    this.addSql(`alter table "printer_configs" add constraint "printer_configs_user_id_unique" unique ("user_id");`);

    this.addSql(`alter table "printer_configs" add constraint "printer_configs_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "printer_configs" cascade;`);
  }

}
