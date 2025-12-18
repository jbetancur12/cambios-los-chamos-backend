import { initDI, DI } from '@/di'
import { logger } from '../lib/logger'

const findMinorista = async () => {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const users = await DI.users.findAll({ populate: ['minorista'] })
    logger.info(`Found users: ${users.length}`)

    for (const user of users) {
      if (user.minorista) {
        const minorista = user.minorista
        logger.info(`Found Minorista: ${user.fullName} (ID: ${minorista.id})`)
        logger.info(`Current Profit Percentage: ${minorista.profitPercentage}`)
      } else {
        logger.info(`User ${user.fullName} is not a minorista.`)
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error finding minoristas')
  } finally {
    await DI.orm.close()
  }
}

findMinorista()
