import { Migration } from '@mikro-orm/migrations';

export class Migration20251122143215 extends Migration {

  override async up(): Promise<void> {
    // Remover PROFIT del enum de tipos de transacción
    // PROFIT ahora forma parte de DISCOUNT (5% del amount)

    // 1. Eliminar todas las transacciones de tipo PROFIT
    this.addSql(`delete from "minorista_transactions" where "type" = 'PROFIT';`);

    // 2. Actualizar la constrain CHECK
    this.addSql(`alter table "minorista_transactions" drop constraint if exists "minorista_transactions_type_check";`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_type_check" check("type" in ('RECHARGE', 'DISCOUNT', 'ADJUSTMENT'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "minorista_transactions" drop constraint if exists "minorista_transactions_type_check";`);

    this.addSql(`alter table "minorista_transactions" add constraint "minorista_transactions_type_check" check("type" in ('RECHARGE', 'DISCOUNT', 'ADJUSTMENT', 'PROFIT'));`);
  }

}
