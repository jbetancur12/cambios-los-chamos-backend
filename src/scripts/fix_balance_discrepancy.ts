import { initDI, DI } from '@/di'
import { logger } from '../lib/logger'

const fixBalanceDiscrepancy = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const minorista = await DI.minoristas.findOne('ed045d65-4f3b-4866-963d-42526c8b9829') // Andreina
    if (!minorista) {
      logger.warn('Minorista not found')
      return
    }

    logger.info('--- BEFORE ---')
    logger.info(`Available Credit: ${minorista.availableCredit}`)
    logger.info(`Credit Balance (Surplus): ${minorista.creditBalance}`)
    logger.info(`Credit Limit: ${minorista.creditLimit}`)

    // Fix logic
    // ...

    logger.info('--- AFTER (Preview) ---')
    logger.info(`Available Credit: ${minorista.availableCredit}`)

    // Persist
    await em.persistAndFlush(minorista)
    console.log('Balance adjusted successfully.')
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

fixBalanceDiscrepancy()
