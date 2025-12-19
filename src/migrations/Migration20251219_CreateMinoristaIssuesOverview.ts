
import { Migration } from '@mikro-orm/migrations';

export class MigrationCreateMinoristaIssuesOverview extends Migration {

    async up(): Promise<void> {
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_issues_overview(
        p_start_date DATE DEFAULT NULL,
        p_end_date DATE DEFAULT NULL
      )
      RETURNS TABLE (
        minorista_id TEXT,
        minorista_name TEXT,
        refund_count BIGINT,
        cancelled_count BIGINT,
        total_refund_amount NUMERIC,
        total_cancelled_amount NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          m.id::TEXT AS minorista_id,
          u.full_name::TEXT AS minorista_name,
          
          -- Refund Counts
          COUNT(CASE WHEN mt.type = 'REFUND' AND mt.status = 'COMPLETED' THEN 1 END) AS refund_count,
          
          -- Cancelled Counts
          COUNT(CASE WHEN mt.status = 'CANCELLED' THEN 1 END) AS cancelled_count,
          
          -- Refund Amount
          COALESCE(SUM(CASE WHEN mt.type = 'REFUND' AND mt.status = 'COMPLETED' THEN mt.amount ELSE 0 END), 0) AS total_refund_amount,
          
          -- Cancelled Amount
          COALESCE(SUM(CASE WHEN mt.status = 'CANCELLED' THEN mt.amount ELSE 0 END), 0) AS total_cancelled_amount

        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        JOIN minorista_transactions mt ON m.id = mt.minorista_id
        WHERE 
          -- Filter: Only Refunds or Cancelled to avoid listing healthy minoristas
          ( (mt.type = 'REFUND' AND mt.status = 'COMPLETED') OR mt.status = 'CANCELLED' )
          AND
          -- Filter by Start Date
          (p_start_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date >= p_start_date)
          AND
          -- Filter by End Date
          (p_end_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date <= p_end_date)
          
        GROUP BY m.id, u.full_name
        ORDER BY (COUNT(CASE WHEN mt.type = 'REFUND' THEN 1 END) + COUNT(CASE WHEN mt.status = 'CANCELLED' THEN 1 END)) DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_issues_overview(DATE, DATE);');
    }

}
