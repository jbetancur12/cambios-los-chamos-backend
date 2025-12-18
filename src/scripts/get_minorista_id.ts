import { DI } from '../di'
import { UserRole } from '../entities/User'
import { logger } from '../lib/logger'

const EMAIL = 'andreinacampos0510@gmail.com'

const main = async () => {
  try {
    const user = await DI.users.findOne({ email: EMAIL })

    if (user) {
      const minorista = await DI.minoristas.findOne({ user })
      if (minorista) {
        logger.info(`MINORISTA_ID: ${minorista.id}`)
      } else {
        logger.warn('Minorista profile not found')
      }
    } else {
      logger.warn('User not found')
    }
  } catch (error) {
    logger.error({ error }, 'Error in get_minorista_id')
  } finally {
    await DI.orm.close()
  }
}

main()
