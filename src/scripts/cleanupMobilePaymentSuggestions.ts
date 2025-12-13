import { MikroORM } from '@mikro-orm/core'
import config from '../mikro-orm.config'
import { BeneficiarySuggestion } from '../entities/BeneficiarySuggestion'
import { ExecutionType } from '../entities/Giro'

async function cleanupMobilePaymentSuggestions() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  console.log('Searching for Mobile Payment suggestions to clean up...')

  try {
    const suggestions = await em.find(BeneficiarySuggestion, {
      executionType: ExecutionType.PAGO_MOVIL,
    })

    const count = suggestions.length
    if (count === 0) {
      console.log('No Mobile Payment suggestions found.')
    } else {
      console.log(`Found ${count} suggestions. Deleting...`)
      for (const suggestion of suggestions) {
        em.remove(suggestion)
      }
      await em.flush()
      console.log(`Successfully deleted ${count} suggestions.`)
    }
  } catch (error) {
    console.error('Error during cleanup:', error)
  } finally {
    await orm.close()
  }
}

cleanupMobilePaymentSuggestions()
