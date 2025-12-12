import { MikroORM } from '@mikro-orm/core';
import config from '../mikro-orm.config';
import { MinoristaTransaction, MinoristaTransactionType, MinoristaTransactionStatus } from '../entities/MinoristaTransaction';

async function checkRefunds() {
    const orm = await MikroORM.init(config);
    const em = orm.em.fork();

    try {
        const repo = em.getRepository(MinoristaTransaction);

        const completedRefunds = await repo.count({
            type: MinoristaTransactionType.REFUND,
            status: MinoristaTransactionStatus.COMPLETED
        });

        const pendingRefunds = await repo.count({
            type: MinoristaTransactionType.REFUND,
            status: MinoristaTransactionStatus.PENDING
        });

        const cancelledRefunds = await repo.count({
            type: MinoristaTransactionType.REFUND,
            status: MinoristaTransactionStatus.CANCELLED
        });

        console.log(`COMPLETED Refunds: ${completedRefunds}`);
        console.log(`PENDING Refunds: ${pendingRefunds}`);
        console.log(`CANCELLED Refunds: ${cancelledRefunds}`);

        if (completedRefunds > 0) {
            // Fetch a few to see dates
            const recent = await repo.find(
                { type: MinoristaTransactionType.REFUND, status: MinoristaTransactionStatus.COMPLETED },
                { limit: 5, orderBy: { createdAt: 'DESC' } }
            );
            console.log("Recent Completed Refunds:", recent.map(t => ({ id: t.id, amount: t.amount, date: t.createdAt })));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await orm.close();
    }
}

checkRefunds();
