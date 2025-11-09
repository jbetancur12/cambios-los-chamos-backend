import { Migration } from '@mikro-orm/migrations';

export class Migration20251109152607 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "bank_assignments" ("id" varchar(255) not null, "destination_bank_name" varchar(255) not null, "transferencista_id" varchar(255) not null, "is_active" boolean not null default true, "priority" int not null default 0, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "bank_assignments_pkey" primary key ("id"));`);
    this.addSql(`create index "bank_assignments_destination_bank_name_index" on "bank_assignments" ("destination_bank_name");`);
    this.addSql(`create index "bank_assignments_is_active_index" on "bank_assignments" ("is_active");`);

    this.addSql(`alter table "bank_assignments" add constraint "bank_assignments_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade;`);

    this.addSql(`alter table "bank_accounts" add column "balance" numeric(10,0) not null default 0;`);

    this.addSql(`alter table "giros" add column "bank_account_used_id" varchar(255) null, add column "execution_type" text check ("execution_type" in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'ZELLE', 'OTROS')) null;`);
    this.addSql(`alter table "giros" add constraint "giros_bank_account_used_id_foreign" foreign key ("bank_account_used_id") references "bank_accounts" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bank_assignments" cascade;`);

    this.addSql(`alter table "giros" drop constraint "giros_bank_account_used_id_foreign";`);

    this.addSql(`alter table "bank_accounts" drop column "balance";`);

    this.addSql(`alter table "giros" drop column "bank_account_used_id", drop column "execution_type";`);
  }

}
