
import { Migration } from '@mikro-orm/migrations';

export class MigrationFilterMinoristaSummaryStatus extends Migration {

    async up(): Promise<void> {

        // 1. Update get_minorista_summary_with_net
        // Drop first to allow replacement
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');

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
        LEFT JOIN minorista_transactions mt ON m.id = mt.minorista_id AND mt.status = 'COMPLETED' -- Solo transacciones COMPLETADAS
        WHERE 
          (p_email IS NULL OR u.email = p_email)
          AND
          (p_fecha IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha)
          
        GROUP BY m.id, u.full_name, m.profit_percentage
        ORDER BY "Total Neto" DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 2. Update get_minorista_daily_summary
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_daily_summary(TEXT, DATE, DATE);');

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
        LEFT JOIN minorista_transactions mt ON m.id = mt.minorista_id AND mt.status = 'COMPLETED' -- Solo COMPLETADAS
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
        // Revert logic omitted for dev speed (drop is enough)
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_summary_with_net(TEXT, DATE);');
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_daily_summary(TEXT, DATE, DATE);');
    }

}
