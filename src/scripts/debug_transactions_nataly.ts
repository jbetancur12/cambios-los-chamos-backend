import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { logger } from '../lib/logger'

const debugTransactions = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const user = await DI.users.findOne({ email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      logger.warn('User or Minorista not found')
      return
    }

    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: user.minorista.id },
      { orderBy: { createdAt: 'DESC' } }
    )

    logger.info(`Found ${transactions.length} total transactions (including CANCELLED):`)
    for (const t of transactions) {
      logger.info(`[${t.id}] ${t.createdAt.toISOString()} | ${t.type} | Amount: ${t.amount} | Status: ${t.status}`)
    }
  } catch (error) {
    logger.error({ error }, 'Error debugging transactions')
  } finally {
    await DI.orm.close()
  }
}

debugTransactions()
