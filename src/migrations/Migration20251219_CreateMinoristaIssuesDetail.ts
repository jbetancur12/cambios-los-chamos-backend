
import { Migration } from '@mikro-orm/migrations';

export class MigrationCreateMinoristaIssuesDetail extends Migration {

    async up(): Promise<void> {
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_issues_detail(
        p_email TEXT DEFAULT NULL,
        p_start_date DATE DEFAULT NULL,
        p_end_date DATE DEFAULT NULL
      )
      RETURNS TABLE (
        transaction_date TIMESTAMP,
        minorista_name TEXT,
        type TEXT,
        status TEXT,
        amount NUMERIC,
        description TEXT,
        giro_id TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          mt.created_at AS transaction_date,
          u.full_name::TEXT AS minorista_name,
          mt.type::TEXT,
          mt.status::TEXT,
          mt.amount,
          mt.description,
          g.id::TEXT AS giro_id
        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        JOIN minorista_transactions mt ON m.id = mt.minorista_id
        LEFT JOIN giros g ON mt.giro_id = g.id
        WHERE 
          -- Filter: Only Refunds or Cancelled transactions
          (mt.type = 'REFUND' OR mt.status = 'CANCELLED')
          AND
          -- Filter by Email (Optional)
          (p_email IS NULL OR u.email = p_email)
          AND
          -- Filter by Start Date
          (p_start_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date >= p_start_date)
          AND
          -- Filter by End Date
          (p_end_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date <= p_end_date)
          
        ORDER BY mt.created_at DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_issues_detail(TEXT, DATE, DATE);');
    }

}
