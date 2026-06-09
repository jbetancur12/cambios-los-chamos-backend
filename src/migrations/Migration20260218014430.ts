import { Migration } from '@mikro-orm/migrations';

export class Migration20260218014430 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "products" ("id" varchar(255) not null, "name" varchar(255) not null, "sku" varchar(255) null, "description" text null, "stock" int not null default 0, "cost_price" numeric(14,2) not null default 0, "selling_price" numeric(14,2) not null default 0, "image_url" varchar(255) null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "products_pkey" primary key ("id"));`);

    this.addSql(`create table "product_transactions" ("id" varchar(255) not null, "product_id" varchar(255) not null, "type" text check ("type" in ('PURCHASE', 'SALE', 'ADJUSTMENT')) not null, "payment_method" text check ("payment_method" in ('CASH', 'TRANSFER', 'CARD', 'CREDIT')) null, "quantity" int not null, "price_per_unit" numeric(14,2) not null, "total_price" numeric(14,2) not null, "profit" numeric(14,2) null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, constraint "product_transactions_pkey" primary key ("id"));`);

    this.addSql(`alter table "product_transactions" add constraint "product_transactions_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade;`);
    this.addSql(`alter table "product_transactions" add constraint "product_transactions_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "product_transactions" drop constraint "product_transactions_product_id_foreign";`);

    this.addSql(`drop table if exists "products" cascade;`);

    this.addSql(`drop table if exists "product_transactions" cascade;`);
  }

}
