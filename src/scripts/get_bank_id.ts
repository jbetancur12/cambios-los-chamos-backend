import { initDI, DI } from '../di'
import { Bank } from '../entities/Bank'
import { logger } from '../lib/logger'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()
    const bank = await em.findOne(Bank, { name: 'BANESCO' })
    if (bank) {
      logger.info(`BANK_ID:${bank.id}`)
    } else {
      logger.error('Bank not found')
    }
  } catch (error) {
    logger.error(error)
  } finally {
    await DI.orm.close()
  }
}

run()
