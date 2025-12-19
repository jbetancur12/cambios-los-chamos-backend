
import { initDI } from '../di';

async function main() {
    const DI = await initDI();
    const knex = (DI.orm.em.fork() as any).getConnection().getKnex();

    console.log('--- Checking Dates of Orphans (JSON) ---');

    try {
        const dates = await knex.raw(`
      SELECT 
        type, 
        status, 
        MIN(created_at) as oldest,
        MAX(created_at) as newest,
        COUNT(*) as count
      FROM minorista_transactions 
      WHERE 
        giro_id IS NULL
        AND (type = 'REFUND' OR type = 'DISCOUNT')
      GROUP BY type, status
    `);

        console.log(JSON.stringify(dates.rows, null, 2));

    } catch (error) {
        console.error('Error:', error);
    }

    await DI.orm.close();
}

main();
