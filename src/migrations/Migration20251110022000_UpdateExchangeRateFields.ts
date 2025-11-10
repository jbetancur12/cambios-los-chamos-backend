import { Migration } from '@mikro-orm/migrations';

export class Migration20251110022000_UpdateExchangeRateFields extends Migration {

  override async up(): Promise<void> {
    // Renombrar campos de exchange_rates
    this.addSql(`alter table "exchange_rates" rename column "cop_to_bs" to "buy_rate";`);
    this.addSql(`alter table "exchange_rates" rename column "usd_to_bs" to "sell_rate";`);
    this.addSql(`alter table "exchange_rates" rename column "bcv_value" to "bcv";`);

    // Agregar nuevo campo usd
    this.addSql(`alter table "exchange_rates" add column "usd" numeric(10,0) not null default 0;`);
  }

  override async down(): Promise<void> {
    // Revertir cambios
    this.addSql(`alter table "exchange_rates" rename column "buy_rate" to "cop_to_bs";`);
    this.addSql(`alter table "exchange_rates" rename column "sell_rate" to "usd_to_bs";`);
    this.addSql(`alter table "exchange_rates" rename column "bcv" to "bcv_value";`);
    this.addSql(`alter table "exchange_rates" drop column "usd";`);
  }

}
