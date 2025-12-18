import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { logger } from '../lib/logger'

const inspectTransactions = async () => {
  // Initialize DI first
  await initDI()

  const em = DI.orm.em.fork()

  try {
    const minoristaId = 'ed045d65-4f3b-4866-963d-42526c8b9829' // Andreina
    const minoristaRepo = DI.minoristas
    const minorista = await minoristaRepo.findOne(minoristaId)

    if (!minorista) {
      logger.warn('Minorista not found')
      return
    }

    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: minorista.id },
      {
        orderBy: { createdAt: 'DESC' },
        limit: 20,
      }
    )

    logger.info('ID | Type | Amount | Profit | Prev Bal | Curr Bal | Prev BalInFavor | Curr BalInFavor | CreatedAt')
    logger.info('-'.repeat(120))

    for (const tx of transactions) {
      logger.info(
        `${tx.id} | ${tx.type} | ${tx.amount} | ${tx.profitEarned || 0} | ${tx.previousAvailableCredit || 0} | ${tx.availableCredit || 0} | ${tx.previousBalanceInFavor || 0} | ${tx.currentBalanceInFavor || 0} | ${tx.createdAt.toISOString()}`
      )
    }
  } catch (error) {
    logger.error({ error }, 'Error inspecting transactions')
  } finally {
    await DI.orm.close()
  }
}

inspectTransactions()
