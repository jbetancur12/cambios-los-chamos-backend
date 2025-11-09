import { Migration } from '@mikro-orm/migrations';

export class Migration20251109034944_AddEnumsForCurrencyAndAccountType extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "banks" alter column "currency" type text using ("currency"::text);`);
    this.addSql(`alter table "banks" add constraint "banks_currency_check" check("currency" in ('VES', 'COP', 'USD'));`);

    this.addSql(`alter table "bank_accounts" alter column "account_type" type text using ("account_type"::text);`);
    this.addSql(`alter table "bank_accounts" add constraint "bank_accounts_account_type_check" check("account_type" in ('AHORROS', 'CORRIENTE'));`);

    this.addSql(`alter table "giros" alter column "currency_input" type text using ("currency_input"::text);`);
    this.addSql(`alter table "giros" add constraint "giros_currency_input_check" check("currency_input" in ('VES', 'COP', 'USD'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "banks" drop constraint if exists "banks_currency_check";`);

    this.addSql(`alter table "bank_accounts" drop constraint if exists "bank_accounts_account_type_check";`);

    this.addSql(`alter table "giros" drop constraint if exists "giros_currency_input_check";`);

    this.addSql(`alter table "banks" alter column "currency" type varchar(255) using ("currency"::varchar(255));`);

    this.addSql(`alter table "bank_accounts" alter column "account_type" type varchar(255) using ("account_type"::varchar(255));`);

    this.addSql(`alter table "giros" alter column "currency_input" type varchar(255) using ("currency_input"::varchar(255));`);
  }

}
