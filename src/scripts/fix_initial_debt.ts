import { initDI, DI } from '@/di'
import { User } from '@/entities/User'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { logger } from '@/lib/logger'

async function fixInitialDebt() {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      logger.warn('Minorista not found')
      return
    }

    const minorista = user.minorista

    // Find the initial negative recharge
    // We search by rough amount in case of float issues, or exact.
    // Amount was -232262.
    // Integer search is safe.
    const initialTx = await em.findOne(MinoristaTransaction, {
      minorista: minorista.id,
      type: MinoristaTransactionType.RECHARGE,
      amount: -232262,
    })

    if (initialTx) {
      logger.info(`Found initial transaction ${initialTx.id}. Updating amount...`)
      initialTx.amount = -432262
      await em.persistAndFlush(initialTx)
      logger.info('Amount updated to -432262. Please run recalculation.')
    } else {
      logger.info('Initial transaction -232262 not found. Already fixed?')
      // Check if -432262 exists
      const fixedTx = await em.findOne(MinoristaTransaction, {
        minorista: minorista.id,
        type: MinoristaTransactionType.RECHARGE,
        amount: -432262,
      })
      if (fixedTx) logger.info('Transaction already -432262.')
    }
  } catch (error) {
    logger.error(error)
  } finally {
    await DI.orm.close()
  }
}

fixInitialDebt()
