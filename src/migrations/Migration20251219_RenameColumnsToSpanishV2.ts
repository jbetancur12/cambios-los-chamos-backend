
import { Migration } from '@mikro-orm/migrations';

export class MigrationRenameColumnsToSpanishV2 extends Migration {

    async up(): Promise<void> {
        // Drop existing function to allow changing return columns
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');

        // Recreate with Spanish headers
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_summary_with_net(
        p_email TEXT DEFAULT NULL,
        p_fecha DATE DEFAULT NULL
      )
      RETURNS TABLE (
        "Nombre" TEXT,
        "Total Giros" NUMERIC,
        "Total Abonos" NUMERIC,
        "Total Reembolsos" NUMERIC,
        "Total Ganancias" NUMERIC,
        "Total Neto" NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          u.full_name::TEXT AS "Nombre",
          
          -- Descuentos (Total Giros)
          COALESCE(SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END), 0) AS "Total Giros",
          
          -- Recargas (Total Abonos)
          COALESCE(SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END), 0) AS "Total Abonos",
          
          -- Reembolsos (Total Reembolsos)
          COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount ELSE 0 END), 0) AS "Total Reembolsos",
          
          -- Ganancias (Total Ganancias)
          COALESCE(SUM(mt.profit_earned), 0) AS "Total Ganancias",
          
          -- NETO (Total Neto)
          (
            - COALESCE(SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(mt.profit_earned), 0)
            - COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount * m.profit_percentage ELSE 0 END), 0)
          ) AS "Total Neto"

        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        LEFT JOIN minorista_transactions mt ON m.id = mt.minorista_id
        WHERE 
          (p_email IS NULL OR u.email = p_email)
          AND
          (p_fecha IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha)
          
        GROUP BY m.id, u.full_name, m.profit_percentage
        ORDER BY "Total Neto" DESC;
      END;
      $$ LANGUAGE plpgsql;
    `)
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');
    }

}
