import { Migration } from '@mikro-orm/migrations'

export class Migration20260508130000_AddPresentationFieldsToTransaction extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "product_transactions" ADD COLUMN IF NOT EXISTS "presentation_id" VARCHAR(255) NULL;`
    )
    this.addSql(
      `ALTER TABLE "product_transactions" ADD COLUMN IF NOT EXISTS "presentation_name" VARCHAR(255) NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "product_transactions" DROP COLUMN IF EXISTS "presentation_id";`)
    this.addSql(`ALTER TABLE "product_transactions" DROP COLUMN IF EXISTS "presentation_name";`)
  }
}
