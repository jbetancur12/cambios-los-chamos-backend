import { Migration } from '@mikro-orm/migrations'

export class Migration20261003010000_CreateRevokedTokens extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "revoked_token" (
        "token_hash" VARCHAR(255) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "revoked_token_pkey" PRIMARY KEY ("token_hash")
      );
    `)
    this.addSql(`CREATE INDEX IF NOT EXISTS "revoked_token_expires_at_index" ON "revoked_token" ("expires_at");`)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "revoked_token";`)
  }
}
