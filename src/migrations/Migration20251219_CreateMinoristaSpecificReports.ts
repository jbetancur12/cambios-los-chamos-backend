
import { Migration } from '@mikro-orm/migrations';

export class MigrationCreateMinoristaSpecificReports extends Migration {

    async up(): Promise<void> {

        // 1. Function for Daily REFUNDS (Completed Refunds)
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_daily_refunds(
        p_email TEXT DEFAULT NULL,
        p_start_date DATE DEFAULT NULL,
        p_end_date DATE DEFAULT NULL
      )
      RETURNS TABLE (
        summary_date DATE,
        minorista_name TEXT,
        total_amount NUMERIC,
        transaction_count BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          (mt.created_at AT TIME ZONE 'America/Bogota')::date AS summary_date,
          u.full_name::TEXT AS minorista_name,
          COALESCE(SUM(mt.amount), 0) AS total_amount,
          COUNT(mt.id) AS transaction_count
        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        JOIN minorista_transactions mt ON m.id = mt.minorista_id 
        WHERE 
          mt.type = 'REFUND' 
          AND mt.status = 'COMPLETED'
          AND (p_email IS NULL OR u.email = p_email)
          AND (p_start_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date >= p_start_date)
          AND (p_end_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date <= p_end_date)
        GROUP BY (mt.created_at AT TIME ZONE 'America/Bogota')::date, m.id, u.full_name
        ORDER BY summary_date DESC, minorista_name ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // 2. Function for Daily CANCELLED (All Cancelled Transactions)
        this.addSql(`
      CREATE OR REPLACE FUNCTION get_minorista_daily_cancelled(
        p_email TEXT DEFAULT NULL,
        p_start_date DATE DEFAULT NULL,
        p_end_date DATE DEFAULT NULL
      )
      RETURNS TABLE (
        summary_date DATE,
        minorista_name TEXT,
        total_amount NUMERIC,
        transaction_count BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          (mt.created_at AT TIME ZONE 'America/Bogota')::date AS summary_date,
          u.full_name::TEXT AS minorista_name,
          COALESCE(SUM(mt.amount), 0) AS total_amount,
          COUNT(mt.id) AS transaction_count
        FROM minoristas m
        JOIN users u ON m.user_id = u.id
        JOIN minorista_transactions mt ON m.id = mt.minorista_id 
        WHERE 
          mt.status = 'CANCELLED'
          AND (p_email IS NULL OR u.email = p_email)
          AND (p_start_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date >= p_start_date)
          AND (p_end_date IS NULL OR (mt.created_at AT TIME ZONE 'America/Bogota')::date <= p_end_date)
        GROUP BY (mt.created_at AT TIME ZONE 'America/Bogota')::date, m.id, u.full_name
        ORDER BY summary_date DESC, minorista_name ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);
    }

    async down(): Promise<void> {
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_daily_refunds(TEXT, DATE, DATE);');
        this.addSql('DROP FUNCTION IF EXISTS get_minorista_daily_cancelled(TEXT, DATE, DATE);');
    }

}
