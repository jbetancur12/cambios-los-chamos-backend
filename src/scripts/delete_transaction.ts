import { initDI, DI } from '@/di'
import { logger } from '../lib/logger'

const deleteTransaction = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const txId = '123' // Replace with actual ID

    // Using DI.minoristaTransactions if available or via EM
    // Assuming DI.minoristaTransactions exists from other scripts
    // If not, use em.getRepository
    // Let's use DI.em.getRepository('MinoristaTransaction') safely

    const repo = DI.em.getRepository('MinoristaTransaction') as any // Cast to avoid typed entity issues if needed
    const tx = await repo.findOne(txId)

    if (!tx) {
      logger.warn(`Transaction ${txId} not found.`)
      return
    }

    logger.info(`Deleting Transaction: ${tx.id} | Type: ${tx.type} | Amount: ${tx.amount}`)
    await em.removeAndFlush(tx)
    logger.info('Transaction deleted successfully.')
  } catch (error) {
    logger.error({ error }, 'Error deleting transaction')
  } finally {
    await DI.orm.close()
  }
}

deleteTransaction()
