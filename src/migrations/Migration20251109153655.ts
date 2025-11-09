import { Migration } from '@mikro-orm/migrations';

export class Migration20251109153655 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint "giros_minorista_id_foreign";`);

    this.addSql(`alter table "giros" alter column "minorista_id" type varchar(255) using ("minorista_id"::varchar(255));`);
    this.addSql(`alter table "giros" alter column "minorista_id" drop not null;`);
    this.addSql(`alter table "giros" add constraint "giros_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop constraint "giros_minorista_id_foreign";`);

    this.addSql(`alter table "giros" alter column "minorista_id" type varchar(255) using ("minorista_id"::varchar(255));`);
    this.addSql(`alter table "giros" alter column "minorista_id" set not null;`);
    this.addSql(`alter table "giros" add constraint "giros_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade;`);
  }

}
