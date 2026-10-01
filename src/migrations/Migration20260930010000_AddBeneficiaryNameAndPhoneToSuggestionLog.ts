import { Migration } from '@mikro-orm/migrations'

export class Migration20260930010000_AddBeneficiaryNameAndPhoneToSuggestionLog extends Migration {
  async up(): Promise<void> {
    this.addSql(`ALTER TABLE "beneficiary_suggestion_log" ADD COLUMN IF NOT EXISTS "beneficiary_name" VARCHAR(255) NULL;`)
    this.addSql(`ALTER TABLE "beneficiary_suggestion_log" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(255) NULL;`)
    // Backfill events logged before these columns existed
    this.addSql(`
      UPDATE "beneficiary_suggestion_log"
      SET "beneficiary_name" = "snapshot"->>'beneficiaryName',
          "phone" = "snapshot"->>'phone'
      WHERE "snapshot" IS NOT NULL AND "beneficiary_name" IS NULL;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`ALTER TABLE "beneficiary_suggestion_log" DROP COLUMN IF EXISTS "phone";`)
    this.addSql(`ALTER TABLE "beneficiary_suggestion_log" DROP COLUMN IF EXISTS "beneficiary_name";`)
  }
}
