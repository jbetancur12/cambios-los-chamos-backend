import { Migration } from '@mikro-orm/migrations';

export class Migration20260514200012_add_presentation_quantity_to_transactions extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "product_transactions" add column "presentation_quantity" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "product_transactions" drop column "presentation_quantity";`);
  }

}
