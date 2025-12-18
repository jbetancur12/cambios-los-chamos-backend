import { DI } from '../di'
import { logger } from '../lib/logger'
import { MikroORM } from '@mikro-orm/core'
import config from '../mikro-orm.config'
import { Minorista } from '../entities/Minorista'
import { User } from '../entities/User'

async function updateMinoristaProfitByName() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  try {
    const defaultProfit = 0.035 // Default profit for everyone else

    // Define targets for specific profit updates
    const targets = [
      { targetName: 'Jesús Segura', targetProfit: 0.06 },
      { targetName: 'Juan Pérez', targetProfit: 0.05 }, // Example additional target
      // Add more specific targets here if needed
    ]

    logger.info('Starting profit percentage update...')

    for (const { targetName, targetProfit } of targets) {
      if (typeof targetProfit !== 'number') continue

      // 1. Buscar usuario por nombre (exacto o parcial)
      const user = await DI.users.findOne({ fullName: { $like: `%${targetName}%` } })

      if (user) {
        // 2. Buscar minorista
        const minorista = await DI.minoristas.findOne({ user })
        if (minorista) {
          logger.info(`Found ${targetName}. Updating profit to ${targetProfit}...`)
          minorista.profitPercentage = targetProfit
          await DI.em.persistAndFlush(minorista)
        } else {
          logger.warn(`User ${targetName} found but has no Minorista profile.`)
        }
      } else {
        logger.warn(`User ${targetName} not found.`)
      }
    }

    // Reset others to default? Optional
    // If you want everyone else to be 3.5, you can iterate all minoristas
    // and set if not in the target list. Be careful with this.

    // Example reset all others logic (commented out by default)
    /*
    const allMinoristas = await DI.minoristas.findAll({ populate: ['user'] });
    const targetNames = targets.map(t => t.targetName);
    for (const m of allMinoristas) {
      const isTarget = targetNames.some(name => m.user.fullName.includes(name));
      if (!isTarget) {
        logger.info(`Resetting ${m.user.fullName} to ${defaultProfit}...`);
        m.profitPercentage = defaultProfit;
        await DI.em.persistAndFlush(m);
      }
    }
    */

    logger.info('Update completed successfully!')
  } catch (error) {
    logger.error({ error }, 'Error updating profit percentages')
  } finally {
    await orm.close()
  }
}

updateMinoristaProfitByName()
