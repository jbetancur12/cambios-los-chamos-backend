import { Migration } from '@mikro-orm/migrations'

export class Migration20260508120000_CreateProductPresentation extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "product_presentations" (
        "id" VARCHAR(255) NOT NULL,
        "product_id" VARCHAR(255) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "quantity" INTEGER NOT NULL,
        "selling_price" DECIMAL(14,2) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`
      ALTER TABLE "product_presentations"
        ADD CONSTRAINT "product_presentations_product_id_foreign"
        FOREIGN KEY ("product_id")
        REFERENCES "products" ("id")
        ON DELETE CASCADE;
    `)
    this.addSql(`
      CREATE INDEX IF NOT EXISTS "idx_product_presentations_product_id"
        ON "product_presentations" ("product_id");
    `)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "product_presentations";`)
  }
}
