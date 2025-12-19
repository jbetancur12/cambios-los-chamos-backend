
import { initDI } from '../di';

async function main() {
    const DI = await initDI();
    const knex = (DI.orm.em.fork() as any).getConnection().getKnex();

    console.log('--- Analyzing Orphans (JSON Mode) ---');

    try {
        const check = await knex.raw(`
      SELECT 
        type, 
        status, 
        COUNT(*) as count
      FROM minorista_transactions 
      WHERE giro_id IS NULL
      GROUP BY type, status
    `);

        console.log('Breakdown of NULL giro_id:', JSON.stringify(check.rows, null, 2));

        const checkEmpty = await knex.raw(`
      SELECT COUNT(*) as count
      FROM minorista_transactions 
      WHERE giro_id = ''
    `);
        console.log("Empty string giro_id count:", checkEmpty.rows[0]);

    } catch (error) {
        console.error('Error:', error);
    }

    await DI.orm.close();
}

main();
