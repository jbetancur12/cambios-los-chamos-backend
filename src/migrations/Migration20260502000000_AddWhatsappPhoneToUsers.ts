import { Migration } from '@mikro-orm/migrations'

export class Migration20260502000000_AddWhatsappPhoneToUsers extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_phone" varchar(20) NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "whatsapp_phone";`)
  }
}
