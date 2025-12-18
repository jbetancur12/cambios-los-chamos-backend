import { MikroORM } from '@mikro-orm/core'
import config from '../mikro-orm.config'
import { BeneficiarySuggestion } from '../entities/BeneficiarySuggestion'
import { ExecutionType } from '../entities/Giro'
import { logger } from '../lib/logger'

async function cleanupMobilePaymentSuggestions() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  logger.info('Searching for Mobile Payment suggestions to clean up...')

  try {
    const suggestions = await em.find(BeneficiarySuggestion, {
      executionType: ExecutionType.PAGO_MOVIL,
    })

    const count = suggestions.length
    if (count === 0) {
      logger.info('No Mobile Payment suggestions found.')
    } else {
      logger.info(`Found ${count} suggestions. Deleting...`)
      for (const suggestion of suggestions) {
        em.remove(suggestion)
      }
      await em.flush()
      logger.info(`Successfully deleted ${count} suggestions.`)
    }
  } catch (error) {
    logger.error({ error }, 'Error during cleanup')
  } finally {
    await orm.close()
  }
}

cleanupMobilePaymentSuggestions()
