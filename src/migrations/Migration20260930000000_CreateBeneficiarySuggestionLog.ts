import { Migration } from '@mikro-orm/migrations'

export class Migration20260930000000_CreateBeneficiarySuggestionLog extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "beneficiary_suggestion_log" (
        "id" VARCHAR(255) NOT NULL,
        "action" VARCHAR(255) NOT NULL,
        "user_id" VARCHAR(255) NOT NULL,
        "user_email" VARCHAR(255) NULL,
        "user_role" VARCHAR(255) NULL,
        "suggestion_id" VARCHAR(255) NOT NULL,
        "giro_id" VARCHAR(255) NULL,
        "execution_type" VARCHAR(255) NOT NULL,
        "beneficiary_id" VARCHAR(255) NOT NULL,
        "changes" JSONB NULL,
        "snapshot" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "beneficiary_suggestion_log_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "beneficiary_suggestion_log_user_id_created_at_index" ON "beneficiary_suggestion_log" ("user_id", "created_at");`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "beneficiary_suggestion_log_beneficiary_id_created_at_index" ON "beneficiary_suggestion_log" ("beneficiary_id", "created_at");`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "beneficiary_suggestion_log_suggestion_id_index" ON "beneficiary_suggestion_log" ("suggestion_id");`
    )
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "beneficiary_suggestion_log";`)
  }
}
