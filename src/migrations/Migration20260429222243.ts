import { Migration } from '@mikro-orm/migrations';

export class Migration20260429222243 extends Migration {

  override async up(): Promise<void> {
    // Fix: Move min_stock to stock if stock is 0 and min_stock was used as initial stock
    this.addSql(`update products set stock = min_stock where stock = 0 and min_stock != 5;`);
    
    // Fix: Reset all min_stock to 5
    this.addSql(`update products set min_stock = 5 where min_stock != 5;`);
  }

  override async down(): Promise<void> {
    // No-op for down migration since we only updated data
  }

}
