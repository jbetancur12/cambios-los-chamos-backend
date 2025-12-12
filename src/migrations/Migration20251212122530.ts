import { Migration } from '@mikro-orm/migrations';

export class Migration20251212122530 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop table if exists "printer_configs" cascade;`);

    this.addSql(`alter table "bank_accounts" alter column "balance" type numeric(18,2) using ("balance"::numeric(18,2));`);

    this.addSql(`alter table "minoristas" alter column "credit_limit" type numeric(18,2) using ("credit_limit"::numeric(18,2));`);
    this.addSql(`alter table "minoristas" alter column "available_credit" type numeric(18,2) using ("available_credit"::numeric(18,2));`);
    this.addSql(`alter table "minoristas" alter column "credit_balance" type numeric(18,2) using ("credit_balance"::numeric(18,2));`);

    this.addSql(`alter table "minorista_transactions" alter column "amount" type numeric(18,2) using ("amount"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "previous_available_credit" type numeric(18,2) using ("previous_available_credit"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "available_credit" type numeric(18,2) using ("available_credit"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "previous_balance_in_favor" type numeric(18,2) using ("previous_balance_in_favor"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "current_balance_in_favor" type numeric(18,2) using ("current_balance_in_favor"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "credit_consumed" type numeric(18,2) using ("credit_consumed"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "profit_earned" type numeric(18,2) using ("profit_earned"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "accumulated_debt" type numeric(18,2) using ("accumulated_debt"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "accumulated_profit" type numeric(18,2) using ("accumulated_profit"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "balance_in_favor_used" type numeric(18,2) using ("balance_in_favor_used"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "credit_used" type numeric(18,2) using ("credit_used"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "remaining_balance" type numeric(18,2) using ("remaining_balance"::numeric(18,2));`);
    this.addSql(`alter table "minorista_transactions" alter column "external_debt" type numeric(18,2) using ("external_debt"::numeric(18,2));`);

    this.addSql(`alter table "bank_account_transactions" alter column "amount" type numeric(18,2) using ("amount"::numeric(18,2));`);
    this.addSql(`alter table "bank_account_transactions" alter column "previous_balance" type numeric(18,2) using ("previous_balance"::numeric(18,2));`);
    this.addSql(`alter table "bank_account_transactions" alter column "current_balance" type numeric(18,2) using ("current_balance"::numeric(18,2));`);
  }

  override async down(): Promise<void> {
    this.addSql(`create table "printer_configs" ("id" varchar(255) not null, "user_id" varchar(255) not null, "name" varchar(255) not null, "type" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "printer_configs_pkey" primary key ("id"));`);
    this.addSql(`create index "printer_configs_user_id_index" on "printer_configs" ("user_id");`);
    this.addSql(`alter table "printer_configs" add constraint "printer_configs_user_id_unique" unique ("user_id");`);

    this.addSql(`alter table "printer_configs" add constraint "printer_configs_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "bank_accounts" alter column "balance" type numeric(10,0) using ("balance"::numeric(10,0));`);

    this.addSql(`alter table "minoristas" alter column "credit_limit" type numeric(10,0) using ("credit_limit"::numeric(10,0));`);
    this.addSql(`alter table "minoristas" alter column "available_credit" type numeric(10,0) using ("available_credit"::numeric(10,0));`);
    this.addSql(`alter table "minoristas" alter column "credit_balance" type numeric(10,0) using ("credit_balance"::numeric(10,0));`);

    this.addSql(`alter table "minorista_transactions" alter column "amount" type numeric(10,0) using ("amount"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "previous_available_credit" type numeric(10,0) using ("previous_available_credit"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "available_credit" type numeric(10,0) using ("available_credit"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "previous_balance_in_favor" type numeric(10,0) using ("previous_balance_in_favor"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "current_balance_in_favor" type numeric(10,0) using ("current_balance_in_favor"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "credit_consumed" type numeric(10,0) using ("credit_consumed"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "profit_earned" type numeric(10,0) using ("profit_earned"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "accumulated_debt" type numeric(10,0) using ("accumulated_debt"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "accumulated_profit" type numeric(10,0) using ("accumulated_profit"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "balance_in_favor_used" type numeric(10,0) using ("balance_in_favor_used"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "credit_used" type numeric(10,0) using ("credit_used"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "remaining_balance" type numeric(10,0) using ("remaining_balance"::numeric(10,0));`);
    this.addSql(`alter table "minorista_transactions" alter column "external_debt" type numeric(10,0) using ("external_debt"::numeric(10,0));`);

    this.addSql(`alter table "bank_account_transactions" alter column "amount" type numeric(10,0) using ("amount"::numeric(10,0));`);
    this.addSql(`alter table "bank_account_transactions" alter column "previous_balance" type numeric(10,0) using ("previous_balance"::numeric(10,0));`);
    this.addSql(`alter table "bank_account_transactions" alter column "current_balance" type numeric(10,0) using ("current_balance"::numeric(10,0));`);
  }

}
