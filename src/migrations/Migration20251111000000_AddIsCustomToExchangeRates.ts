import { Migration } from '@mikro-orm/migrations';

export class Migration20251111000000_AddIsCustomToExchangeRates extends Migration {

  override async up(): Promise<void> {
    // Agregar campo isCustom a exchange_rates
    this.addSql(`alter table "exchange_rates" add column "is_custom" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    // Revertir cambios
    this.addSql(`alter table "exchange_rates" drop column "is_custom";`);
  }

}
