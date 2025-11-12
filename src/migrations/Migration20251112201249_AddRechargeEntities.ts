import { Migration } from '@mikro-orm/migrations';

export class Migration20251112201249_AddRechargeEntities extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "recharge_operators" ("id" varchar(255) not null, "name" varchar(255) not null, "type" text check ("type" in ('MOVISTAR', 'DIGITEL', 'INTER', 'OTRO')) not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "recharge_operators_pkey" primary key ("id"));`);

    this.addSql(`create table "recharge_amounts" ("id" varchar(255) not null, "amount_bs" numeric(15,2) not null, "is_active" boolean not null default true, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "recharge_amounts_pkey" primary key ("id"));`);

    this.addSql(`alter table "recharge_amounts" add constraint "recharge_amounts_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "recharge_operators" cascade;`);

    this.addSql(`drop table if exists "recharge_amounts" cascade;`);
  }

}
