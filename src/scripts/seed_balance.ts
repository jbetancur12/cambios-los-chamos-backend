import { MikroORM } from '@mikro-orm/core'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import mikroOrmConfig from '../mikro-orm.config'
import { DI } from '../di'
import { logger } from '../lib/logger'

const seedBalance = async () => {
  const seeds = [
    { email: 'andreinacampos0510@gmail.com', credit: 2000000 },
    // AÑADE MÁS SI ES NECESARIO
  ]

  logger.info('Seeding balances...')

  for (const s of seeds) {
    const { email, credit } = s
    const user = await DI.users.findOne({ email })
    if (user) {
      const minorista = await DI.minoristas.findOne({ user })
      if (minorista) {
        minorista.availableCredit = credit
        await DI.em.persistAndFlush(minorista)
        logger.info(`Updated credit for ${email}`)
      } else {
        logger.error(`User or Minorista not found: ${email}`)
      }
    }
  }

  logger.info('Balance seeding complete.')
}

seedBalance().catch((err) => logger.error({ err }, 'Error seeding balance'))
