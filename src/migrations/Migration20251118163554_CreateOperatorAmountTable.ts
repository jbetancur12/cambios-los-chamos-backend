import { Migration } from '@mikro-orm/migrations';

export class Migration20251118163554_CreateOperatorAmountTable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "operator_amounts" ("id" varchar(255) not null, "operator_id" varchar(255) not null, "amount_id" varchar(255) not null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "operator_amounts_pkey" primary key ("id"));`);

    this.addSql(`alter table "operator_amounts" add constraint "operator_amounts_operator_id_foreign" foreign key ("operator_id") references "recharge_operators" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "operator_amounts" add constraint "operator_amounts_amount_id_foreign" foreign key ("amount_id") references "recharge_amounts" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "recharge_operators" drop constraint if exists "recharge_operators_type_check";`);

    this.addSql(`alter table "recharge_operators" alter column "type" type varchar(255) using ("type"::varchar(255));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "operator_amounts" cascade;`);

    this.addSql(`alter table "recharge_operators" alter column "type" type text using ("type"::text);`);
    this.addSql(`alter table "recharge_operators" add constraint "recharge_operators_type_check" check("type" in ('MOVISTAR', 'DIGITEL', 'INTER', 'OTRO'));`);
  }

}
