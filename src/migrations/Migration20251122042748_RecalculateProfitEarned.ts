import { Migration } from '@mikro-orm/migrations';

export class Migration20251122042748_RecalculateProfitEarned extends Migration {

  override async up(): Promise<void> {
    // Recalculate profitEarned for DISCOUNT transactions: 5% of amount
    this.addSql(`update "minorista_transactions" set "profit_earned" = ("amount" * 0.05) where "type" = 'DISCOUNT' and "profit_earned" = 0;`);
  }

  override async down(): Promise<void> {
    // Reset profitEarned to 0 for DISCOUNT transactions (revert)
    this.addSql(`update "minorista_transactions" set "profit_earned" = 0 where "type" = 'DISCOUNT';`);
  }

}
