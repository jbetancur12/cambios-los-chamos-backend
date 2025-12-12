import { Migration } from '@mikro-orm/migrations';

export class Migration20251212133736 extends Migration {

  async up(): Promise<void> {
    // Corrige el cálculo de system_profit para giros de tipo PAGO_MOVIL y RECARGA
    // La fórmula correcta es: TotalProfit - MinoristaProfit
    // Donde TotalProfit = amount_input - (amount_input / sell_rate * buy_rate)
    // Anteriormente se estaba usando un fijo del 5% del monto total para system_profit

    this.addSql(`
      UPDATE "giros" g
      SET "system_profit" = g."amount_input" - (g."amount_input" / er."sell_rate" * er."buy_rate") - g."minorista_profit"
      FROM "exchange_rates" er
      WHERE g."rate_applied_id" = er."id"
        AND g."execution_type" IN ('PAGO_MOVIL', 'RECARGA')
        AND g."rate_applied_id" IS NOT NULL;
    `);
  }

  async down(): Promise<void> {
    // No hay reversión fácil exacta porque el valor anterior era incorrecto (5% fijo)
    // y no queremos volver a ello.
  }

}
