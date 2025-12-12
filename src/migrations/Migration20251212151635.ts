import { Migration } from '@mikro-orm/migrations';

export class Migration20251212151635 extends Migration {

  override async up(): Promise<void> {
    // Actualizar el balance de los minoristas basándose en su última transacción
    // Se toma la transacción más reciente para cada minorista y se usa availableCredit y currentBalanceInFavor
    // para sobreescribir el estado actual del minorista.
    this.addSql(`
      UPDATE minoristas m
      SET 
        available_credit = t.available_credit,
        credit_balance = COALESCE(t.current_balance_in_favor, 0)
      FROM (
        SELECT DISTINCT ON (minorista_id) 
          minorista_id, 
          available_credit, 
          current_balance_in_favor
        FROM minorista_transactions
        ORDER BY minorista_id, created_at DESC
      ) t
      WHERE m.id = t.minorista_id;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`select 1`);
  }

}
