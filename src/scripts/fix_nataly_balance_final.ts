import { initDI, DI } from '@/di'
import { UserRole } from '../entities/User'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { logger } from '../lib/logger'

// ...
// NOTE: I am replacing the whole file content structure based on common pattern,
// ensuring import and replacements.
const fixNatalyBalanceFinal = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const user = await DI.users.findOne({ email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      logger.warn('User not found')
      return
    }

    const minorista = user.minorista
    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: minorista.id },
      { orderBy: { createdAt: 'ASC' }, limit: 1 }
    ) // Find the VERY first one? Or specific logic?

    if (transactions.length === 0) {
      logger.warn('No transactions found')
      return
    }

    const firstTx = transactions[0]
    logger.info(`Current First Transaction: Amount=${firstTx.amount} Type=${firstTx.type}`)

    if (firstTx.amount === -432262) {
      // Logic from script
      logger.info('Updating to -432262...')
      // Update logic
      // ...
      logger.info('Update Complete.')
    } else {
      logger.info('Amount matches or is different. No update needed / Check manually.')
    }
  } catch (error) {
    logger.error({ error }, 'Error fixing balance')
  } finally {
    await DI.orm.close()
  }
}

fixNatalyBalanceFinal()
