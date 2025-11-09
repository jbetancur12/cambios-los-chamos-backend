import { Migration } from '@mikro-orm/migrations';

export class Migration20251109183903 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index "bank_assignments_destination_bank_name_index";`);
    this.addSql(`alter table "bank_assignments" drop column "destination_bank_name";`);

    this.addSql(`alter table "bank_assignments" add column "bank_id" varchar(255) not null;`);
    this.addSql(`alter table "bank_assignments" add constraint "bank_assignments_bank_id_foreign" foreign key ("bank_id") references "banks" ("id") on update cascade;`);
    this.addSql(`create index "bank_assignments_bank_id_index" on "bank_assignments" ("bank_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bank_assignments" drop constraint "bank_assignments_bank_id_foreign";`);

    this.addSql(`drop index "bank_assignments_bank_id_index";`);
    this.addSql(`alter table "bank_assignments" drop column "bank_id";`);

    this.addSql(`alter table "bank_assignments" add column "destination_bank_name" varchar(255) not null;`);
    this.addSql(`create index "bank_assignments_destination_bank_name_index" on "bank_assignments" ("destination_bank_name");`);
  }

}
