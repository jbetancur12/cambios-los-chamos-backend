import { Migration } from '@mikro-orm/migrations'

export class Migration20260502001000_AddSenderPhoneToGiroAndSuggestions extends Migration {
  async up(): Promise<void> {
    // Agregar sender_phone al giro (teléfono del remitente para WhatsApp)
    this.addSql(
      `ALTER TABLE "giros" ADD COLUMN IF NOT EXISTS "sender_phone" varchar(30) NULL;`
    )
    // Agregar sender_phone a beneficiary_suggestion (para auto-completar)
    this.addSql(
      `ALTER TABLE "beneficiary_suggestion" ADD COLUMN IF NOT EXISTS "sender_phone" varchar(30) NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "giros" DROP COLUMN IF EXISTS "sender_phone";`)
    this.addSql(`ALTER TABLE "beneficiary_suggestion" DROP COLUMN IF EXISTS "sender_phone";`)
  }
}
