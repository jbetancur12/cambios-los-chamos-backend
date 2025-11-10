import { Migration } from '@mikro-orm/migrations';

export class Migration20251110161438 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "exchange_rates" alter column "buy_rate" type numeric(15,4) using ("buy_rate"::numeric(15,4));`);
    this.addSql(`alter table "exchange_rates" alter column "sell_rate" type numeric(15,4) using ("sell_rate"::numeric(15,4));`);
    this.addSql(`alter table "exchange_rates" alter column "usd" type numeric(15,4) using ("usd"::numeric(15,4));`);
    this.addSql(`alter table "exchange_rates" alter column "bcv" type numeric(15,4) using ("bcv"::numeric(15,4));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "exchange_rates" alter column "buy_rate" type numeric(10,0) using ("buy_rate"::numeric(10,0));`);
    this.addSql(`alter table "exchange_rates" alter column "sell_rate" type numeric(10,0) using ("sell_rate"::numeric(10,0));`);
    this.addSql(`alter table "exchange_rates" alter column "usd" type numeric(10,0) using ("usd"::numeric(10,0));`);
    this.addSql(`alter table "exchange_rates" alter column "bcv" type numeric(10,0) using ("bcv"::numeric(10,0));`);
  }

}
