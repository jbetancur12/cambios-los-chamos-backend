
import { Migration } from '@mikro-orm/migrations';

export class MigrationFinalMinoristaSummary extends Migration {

    async up(): Promise<void> {
        // Drop all previous versions/signatures of the function
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TIMESTAMP, TIMESTAMP, TEXT);');
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TIMESTAMP WITHOUT TIME ZONE, TIMESTAMP WITHOUT TIME ZONE, TEXT);');
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');

        // Create the final version: No ID, No Email in output, just Name + Totals
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_summary_with_net(
        p_email TEXT DEFAULT NULL,
        p_fecha DATE DEFAULT NULL
      )
      RETURNS TABLE (
        minorista_name TEXT,
        total_discount NUMERIC,
        total_recharge NUMERIC,
        total_refund NUMERIC,
        total_profit NUMERIC,
        net_total NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          u.full_name::TEXT AS minorista_name,
          
          -- Descuentos
          COALESCE(SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END), 0) AS total_discount,
          
          -- Recargas
          COALESCE(SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END), 0) AS total_recharge,
          
          -- Reembolsos
          COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount ELSE 0 END), 0) AS total_refund,
          
          -- Ganancias
          COALESCE(SUM(mt.profit_earned), 0) AS total_profit,
          
          -- NETO
          (
            - COALESCE(SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount ELSE 0 END), 0)
            + COALESCE(SUM(mt.profit_earned), 0)
            - COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount * m.profit_percentage ELSE 0 END), 0)
          ) AS net_total

        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        LEFT JOIN minorista_transactions mt ON m.id = mt.minorista_id
        WHERE 
          (p_email IS NULL OR u.email = p_email)
          AND
          (p_fecha IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha)
          
        GROUP BY m.id, u.full_name, m.profit_percentage
        ORDER BY net_total DESC;
      END;
      $$ LANGUAGE plpgsql;
    `)
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');
    }

}
