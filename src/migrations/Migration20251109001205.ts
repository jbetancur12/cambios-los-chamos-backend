import { Migration } from '@mikro-orm/migrations';

export class Migration20251109001205 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "banks" ("id" varchar(255) not null, "name" varchar(255) not null, "currency" varchar(255) not null, "current_balance" numeric(10,0) not null default 0, constraint "banks_pkey" primary key ("id"));`);

    this.addSql(`create table "users" ("id" varchar(255) not null, "full_name" varchar(255) not null, "email" varchar(255) not null, "password" varchar(255) not null, "role" text check ("role" in ('SUPER_ADMIN', 'ADMIN', 'MINORISTA', 'TRANSFERENCISTA')) not null, "is_active" boolean not null default true, "email_verified" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "users_pkey" primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`create table "transferencistas" ("id" varchar(255) not null, "user_id" varchar(255) not null, "available" boolean not null default true, constraint "transferencistas_pkey" primary key ("id"));`);
    this.addSql(`alter table "transferencistas" add constraint "transferencistas_user_id_unique" unique ("user_id");`);

    this.addSql(`create table "bank_accounts" ("id" varchar(255) not null, "transferencista_id" varchar(255) not null, "bank_id" varchar(255) not null, "account_number" varchar(255) not null, "account_holder" varchar(255) not null, "account_type" varchar(255) null, constraint "bank_accounts_pkey" primary key ("id"));`);

    this.addSql(`create table "minoristas" ("id" varchar(255) not null, "user_id" varchar(255) not null, "balance" numeric(10,0) not null default 0, constraint "minoristas_pkey" primary key ("id"));`);
    this.addSql(`alter table "minoristas" add constraint "minoristas_user_id_unique" unique ("user_id");`);

    this.addSql(`create table "minorista_transactions" ("id" varchar(255) not null, "minorista_id" varchar(255) not null, "amount" numeric(10,0) not null, "type" text check ("type" in ('RECHARGE', 'DISCOUNT', 'ADJUSTMENT')) not null, "previous_balance" numeric(10,0) not null, "current_balance" numeric(10,0) not null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, constraint "minorista_transactions_pkey" primary key ("id"));`);

    this.addSql(`create table "exchane_rates" ("id" varchar(255) not null, "cop_to_bs" numeric(10,0) not null, "usd_to_bs" numeric(10,0) not null, "bcv_value" numeric(10,0) not null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, constraint "exchane_rates_pkey" primary key ("id"));`);

    this.addSql(`create table "giros" ("id" varchar(255) not null, "minorista_id" varchar(255) not null, "transferencista_id" varchar(255) null, "rate_applied_id" varchar(255) not null, "beneficiary_name" varchar(255) not null, "beneficiary_id" varchar(255) not null, "bank_name" varchar(255) not null, "account_number" varchar(255) not null, "phone" varchar(255) not null, "amount_input" numeric(10,0) not null, "currency_input" varchar(255) not null, "amount_bs" numeric(10,0) not null, "commission" numeric(10,0) null, "status" text check ("status" in ('PENDIENTE', 'ASIGNADO', 'PROCESANDO', 'COMPLETADO', 'CANCELADO')) not null default 'PENDIENTE', "proof_url" varchar(255) null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "giros_pkey" primary key ("id"));`);

    this.addSql(`create table "email_verification_code" ("id" bigserial primary key, "code" varchar(6) not null, "created_at" timestamptz not null, "expires_at" timestamptz not null, "attempts" int not null default 0, "user_id" varchar(255) not null);`);
    this.addSql(`create index "email_verification_code_code_idx" on "email_verification_code" ("code");`);
    this.addSql(`alter table "email_verification_code" add constraint "email_verification_code_user_id_key" unique ("user_id") deferrable initially deferred;`);

    this.addSql(`create table "bank_tansactions" ("id" varchar(255) not null, "bank_id" varchar(255) not null, "amount" numeric(10,0) not null, "type" text check ("type" in ('RECHARGE', 'TRANSFER', 'ADJUSTMENT')) not null, "commission" numeric(10,0) null, "previous_balance" numeric(10,0) not null, "current_balance" numeric(10,0) not null, "created_by_id" varchar(255) not null, "created_at" timestamptz not null, constraint "bank_tansactions_pkey" primary key ("id"));`);

    this.addSql(`alter table "transferencistas" add constraint "transferencistas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "bank_accounts" add constraint "bank_accounts_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade;`);
    this.addSql(`alter table "bank_accounts" add constraint "bank_accounts_bank_id_foreign" foreign key ("bank_id") references "banks" ("id") on update cascade;`);

    this.addSql(`alter table "minoristas" add constraint "minoristas_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade;`);
    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "exchane_rates" add constraint "exchane_rates_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "giros" add constraint "giros_minorista_id_foreign" foreign key ("minorista_id") references "minoristas" ("id") on update cascade;`);
    this.addSql(`alter table "giros" add constraint "giros_transferencista_id_foreign" foreign key ("transferencista_id") references "transferencistas" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "giros" add constraint "giros_rate_applied_id_foreign" foreign key ("rate_applied_id") references "exchane_rates" ("id") on update cascade;`);
    this.addSql(`alter table "giros" add constraint "giros_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);

    this.addSql(`alter table "email_verification_code" add constraint "email_verification_code_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade deferrable initially deferred ;`);

    this.addSql(`alter table "bank_tansactions" add constraint "bank_tansactions_bank_id_foreign" foreign key ("bank_id") references "banks" ("id") on update cascade;`);
    this.addSql(`alter table "bank_tansactions" add constraint "bank_tansactions_created_by_id_foreign" foreign key ("created_by_id") references "users" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "bank_accounts" drop constraint "bank_accounts_bank_id_foreign";`);

    this.addSql(`alter table "bank_tansactions" drop constraint "bank_tansactions_bank_id_foreign";`);

    this.addSql(`alter table "transferencistas" drop constraint "transferencistas_user_id_foreign";`);

    this.addSql(`alter table "minoristas" drop constraint "minoristas_user_id_foreign";`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_created_by_id_foreign";`);

    this.addSql(`alter table "exchane_rates" drop constraint "exchane_rates_created_by_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_created_by_id_foreign";`);

    this.addSql(`alter table "email_verification_code" drop constraint "email_verification_code_user_id_foreign";`);

    this.addSql(`alter table "bank_tansactions" drop constraint "bank_tansactions_created_by_id_foreign";`);

    this.addSql(`alter table "bank_accounts" drop constraint "bank_accounts_transferencista_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_transferencista_id_foreign";`);

    this.addSql(`alter table "minorista_transactions" drop constraint "minorista_transactions_minorista_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_minorista_id_foreign";`);

    this.addSql(`alter table "giros" drop constraint "giros_rate_applied_id_foreign";`);

    this.addSql(`drop table if exists "banks" cascade;`);

    this.addSql(`drop table if exists "users" cascade;`);

    this.addSql(`drop table if exists "transferencistas" cascade;`);

    this.addSql(`drop table if exists "bank_accounts" cascade;`);

    this.addSql(`drop table if exists "minoristas" cascade;`);

    this.addSql(`drop table if exists "minorista_transactions" cascade;`);

    this.addSql(`drop table if exists "exchane_rates" cascade;`);

    this.addSql(`drop table if exists "giros" cascade;`);

    this.addSql(`drop table if exists "email_verification_code" cascade;`);

    this.addSql(`drop table if exists "bank_tansactions" cascade;`);
  }

}
