import { Migration } from '@mikro-orm/migrations';

export class Migration20251109034000_FixTableNameTypos extends Migration {

  override async up(): Promise<void> {
    // Renombrar tabla exchane_rates a exchange_rates (corregir typo)
    this.addSql(`alter table if exists "exchane_rates" rename to "exchange_rates";`);

    // Renombrar tabla bank_tansactions a bank_transactions (corregir typo)
    this.addSql(`alter table if exists "bank_tansactions" rename to "bank_transactions";`);
  }

  override async down(): Promise<void> {
    // Revertir: renombrar exchange_rates de vuelta a exchane_rates
    this.addSql(`alter table if exists "exchange_rates" rename to "exchane_rates";`);

    // Revertir: renombrar bank_transactions de vuelta a bank_tansactions
    this.addSql(`alter table if exists "bank_transactions" rename to "bank_tansactions";`);
  }

}
