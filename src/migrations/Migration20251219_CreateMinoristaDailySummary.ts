
import { Migration } from '@mikro-orm/migrations';

export class MigrationCreateMinoristaDailySummary extends Migration {

    async up(): Promise<void> {
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_daily_summary(
        p_email TEXT DEFAULT NULL,
        p_start_date DATE DEFAULT NULL,
        p_end_date DATE DEFAULT NULL
      )
      RETURNS TABLE (
        summary_date DATE,
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
          (mt.created_at AT TIME ZONE 'America/Bogota')::date AS summary_date,
          u.full_name::TEXT AS minorista_name,
          
          -- Descuentos
          COALESCE(SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END), 0) AS total_discount,
          
          -- Recargas
          COALESCE(SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END), 0) AS total_recharge,
          
          -- Reembolsos
          COALESCE(SUM(CASE WHEN mt.type = 'REFUND' THEN mt.amount ELSE 0 END), 0) AS total_refund,
          
          -- Ganancias
          COALESCE(SUM(mt.profit_earned), 0) AS total_profit,
          
          -- NETO logic
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
          -- Filter by Email
          (p_email IS NULL OR u.email = p_email)
          AND
          -- Filter by Start Date
          (p_start_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date >= p_start_date)
          AND
          -- Filter by End Date
          (p_end_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date <= p_end_date)
          
        GROUP BY (mt.created_at AT TIME ZONE 'America/Bogota')::date, m.id, u.full_name, m.profit_percentage
        ORDER BY summary_date DESC, minorista_name ASC;
      END;
      $$ LANGUAGE plpgsql;
    `)
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_daily_summary(TEXT, DATE, DATE);');
    }

}
