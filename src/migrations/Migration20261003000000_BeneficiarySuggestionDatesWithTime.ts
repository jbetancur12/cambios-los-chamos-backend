import { Migration } from '@mikro-orm/migrations'

/**
 * created_at and updated_at of beneficiary_suggestion were created as "date" (day only, no time), so the list could
 * not be ordered from newest to oldest within the same day. They become timestamptz.
 * Existing rows keep their day (at midnight); new and updated rows get the real time.
 */
export class Migration20261003000000_BeneficiarySuggestionDatesWithTime extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "beneficiary_suggestion"
        ALTER COLUMN "created_at" TYPE timestamptz USING "created_at"::timestamptz,
        ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at"::timestamptz;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "beneficiary_suggestion"
        ALTER COLUMN "created_at" TYPE date USING "created_at"::date,
        ALTER COLUMN "updated_at" TYPE date USING "updated_at"::date;
    `)
  }
}
