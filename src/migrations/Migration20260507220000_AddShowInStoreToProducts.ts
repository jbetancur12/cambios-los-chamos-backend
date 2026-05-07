import { Migration } from '@mikro-orm/migrations'

export class Migration20260507220000_AddShowInStoreToProducts extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_store" boolean NOT NULL DEFAULT true;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "products" DROP COLUMN IF EXISTS "show_in_store";`)
  }
}
