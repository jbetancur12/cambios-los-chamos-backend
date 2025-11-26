import { Migration } from '@mikro-orm/migrations';

export class Migration20251126195514 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" add column "executed_by_id" varchar(255) null;`);
    this.addSql(`alter table "giros" add constraint "giros_executed_by_id_foreign" foreign key ("executed_by_id") references "users" ("id") on update cascade on delete restrict;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint "giros_executed_by_id_foreign";`);

    this.addSql(`alter table "giros" drop column "executed_by_id";`);
  }

}
