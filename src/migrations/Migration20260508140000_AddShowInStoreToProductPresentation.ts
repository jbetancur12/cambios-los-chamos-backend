import { Migration } from '@mikro-orm/migrations'

export class Migration20260508140000_AddShowInStoreToProductPresentation extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "product_presentations" ADD COLUMN IF NOT EXISTS "show_in_store" boolean NOT NULL DEFAULT true;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "product_presentations" DROP COLUMN IF EXISTS "show_in_store";`)
  }
}
