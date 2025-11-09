import { Migration } from '@mikro-orm/migrations';

export class Migration20251109214233 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "bank_account_transactions" ("id" varchar(255) not null, "bank_account_id" varchar(255) not null, "amount" numeric(10,0) not null, "type" text check ("type" in ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT')) not null, "previous_balance" numeric(10,0) not null, "current_balance" numeric(10,0) not null, "reference" varchar(255) null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, constraint "bank_account_transactions_pkey" primary key ("id"));`);
    this.addSql(`create index "bank_account_transactions_created_at_index" on "bank_account_transactions" ("created_at");`);

    this.addSql(`alter table "bank_account_transactions" add constraint "bank_account_transactions_bank_account_id_foreign" foreign key ("bank_account_id") references "bank_accounts" ("id") on update cascade;`);
    this.addSql(`alter table "bank_account_transactions" add constraint "bank_account_transactions_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bank_account_transactions" cascade;`);
  }

}
