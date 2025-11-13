import { Migration } from '@mikro-orm/migrations';

export class Migration20251113024543 extends Migration {

  override async up(): Promise<void> {
    // Eliminar columnas si existen
    this.addSql(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'previous_balance'
        ) THEN
          ALTER TABLE "minorista_transactions" DROP COLUMN "previous_balance";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'current_balance'
        ) THEN
          ALTER TABLE "minorista_transactions" DROP COLUMN "current_balance";
        END IF;
      END
      $$;
    `);

    // Agregar columnas si no existen
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'previous_available_credit'
        ) THEN
          ALTER TABLE "minorista_transactions" ADD COLUMN "previous_available_credit" numeric(10,0) NOT NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'available_credit'
        ) THEN
          ALTER TABLE "minorista_transactions" ADD COLUMN "available_credit" numeric(10,0) NOT NULL;
        END IF;
      END
      $$;
    `);
  }

  override async down(): Promise<void> {
    // Revertir los cambios con verificación
    this.addSql(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'previous_available_credit'
        ) THEN
          ALTER TABLE "minorista_transactions" DROP COLUMN "previous_available_credit";
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'available_credit'
        ) THEN
          ALTER TABLE "minorista_transactions" DROP COLUMN "available_credit";
        END IF;
      END
      $$;
    `);

    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'previous_balance'
        ) THEN
          ALTER TABLE "minorista_transactions" ADD COLUMN "previous_balance" numeric(10,0) NOT NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'minorista_transactions' AND column_name = 'current_balance'
        ) THEN
          ALTER TABLE "minorista_transactions" ADD COLUMN "current_balance" numeric(10,0) NOT NULL;
        END IF;
      END
      $$;
    `);
  }
}