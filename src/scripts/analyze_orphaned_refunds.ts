
import { initDI } from '../di';

async function main() {
    const DI = await initDI();
    const knex = (DI.orm.em.fork() as any).getConnection().getKnex();

    console.log('--- Analyzing Orphaned Refunds/Cancelled Transactions ---');

    try {
        // 1. Count orphans per Type/Status
        const breakdown = await knex.raw(`
      SELECT 
        type, 
        status, 
        COUNT(*) as count,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence
      FROM minorista_transactions 
      WHERE 
        (type = 'REFUND' OR status = 'CANCELLED')
        AND giro_id IS NULL
      GROUP BY type, status
    `);

        console.table(breakdown.rows);

        // 2. Sample some recent orphans to see details
        const recentSamples = await knex.raw(`
      SELECT 
        id, 
        created_at, 
        type, 
        status, 
        amount, 
        description 
      FROM minorista_transactions 
      WHERE 
        (type = 'REFUND' OR status = 'CANCELLED')
        AND giro_id IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);

        console.log('\n--- Recent Examples (Top 5) ---');
        console.table(recentSamples.rows);

    } catch (error) {
        console.error('Error:', error);
    }

    await DI.orm.close();
}

main();
