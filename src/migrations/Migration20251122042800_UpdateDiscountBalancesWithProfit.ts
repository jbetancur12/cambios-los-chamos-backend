import { Migration } from '@mikro-orm/migrations';

export class Migration20251122042800_UpdateDiscountBalancesWithProfit extends Migration {

  override async up(): Promise<void> {
    // Update availableCredit for DISCOUNT transactions to include the profit (5% of amount)
    // availableCredit should be the previous balance minus the discount plus the profit
    this.addSql(`
      update "minorista_transactions"
      set "available_credit" = "available_credit" + ("amount" * 0.05)
      where "type" = 'DISCOUNT'
      and "available_credit" > 0;
    `);
  }

  override async down(): Promise<void> {
    // Revert: subtract the profit from availableCredit for DISCOUNT transactions
    this.addSql(`
      update "minorista_transactions"
      set "available_credit" = "available_credit" - ("amount" * 0.05)
      where "type" = 'DISCOUNT';
    `);
  }

}
