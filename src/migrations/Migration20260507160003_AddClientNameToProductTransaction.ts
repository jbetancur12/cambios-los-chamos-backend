import { Migration } from '@mikro-orm/migrations'

export class Migration20260507160003_AddClientNameToProductTransaction extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "product_transactions" ADD COLUMN IF NOT EXISTS "client_name" varchar(255) NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "product_transactions" DROP COLUMN IF EXISTS "client_name";`)
  }
}
