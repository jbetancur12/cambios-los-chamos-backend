import { Migration } from '@mikro-orm/migrations'

export class Migration20251116000000_AddPaymentProofKeyToGiro extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "giros" add column "payment_proof_key" varchar(255) null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "giros" drop column "payment_proof_key";`)
  }
}
