import { Migration } from '@mikro-orm/migrations';

export class Migration20251119022355 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_giro_id_foreign";`);

    this.addSql(`alter table "printer_configs" alter column "type" type varchar(255) using ("type"::varchar(255));`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_giro_id_unique";`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_giro_id_foreign" foreign key ("giro_id") references "giros" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_giro_id_foreign";`);

    this.addSql(`alter table "printer_configs" alter column "type" type PrinterType using ("type"::PrinterType);`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_giro_id_foreign" foreign key ("giro_id") references "giros" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_giro_id_unique" unique ("giro_id");`);
  }

}
