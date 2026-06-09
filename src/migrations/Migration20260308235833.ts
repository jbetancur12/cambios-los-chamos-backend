import { Migration } from '@mikro-orm/migrations';

export class Migration20260308235833 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "customer_invoice_data" ("id" varchar(255) not null, "identification" varchar(255) not null, "dv" varchar(255) null, "names" varchar(255) not null, "email" varchar(255) not null, "phone" varchar(255) not null, "address" varchar(255) not null, "municipality_id" int not null default 980, "tribute_id" int not null default 21, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "customer_invoice_data_pkey" primary key ("id"));`);
    this.addSql(`alter table "customer_invoice_data" add constraint "customer_invoice_data_identification_unique" unique ("identification");`);

    this.addSql(`alter table "giros" add column "is_facturado" boolean not null default false, add column "factura_id" varchar(255) null, add column "factura_status" int not null default 0, add column "factura_fecha" timestamptz null;`);
    this.addSql(`create index "giros_is_facturado_index" on "giros" ("is_facturado");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "customer_invoice_data" cascade;`);

    this.addSql(`drop index "giros_is_facturado_index";`);
    this.addSql(`alter table "giros" drop column "is_facturado", drop column "factura_id", drop column "factura_status", drop column "factura_fecha";`);
  }

}
