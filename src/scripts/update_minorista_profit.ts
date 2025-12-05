import { DI } from '../di'
import { MikroORM } from '@mikro-orm/core'
import config from '../mikro-orm.config'
import { Minorista } from '../entities/Minorista'
import { User } from '../entities/User'

async function updateMinoristaProfitByName() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  try {
    const targetName = 'Jesús Segura'
    const targetProfit = 0.06
    const defaultProfit = 0.05

    console.log('Starting profit percentage update...')

    // 1. Update Jesús Segura
    const jesusUser = await em.findOne(User, { fullName: targetName })
    if (jesusUser) {
      const minorista = await em.findOne(Minorista, { user: jesusUser.id })
      if (minorista) {
        console.log(`Found ${targetName}. Updating profit to ${targetProfit}...`)
        minorista.profitPercentage = targetProfit
        em.persist(minorista)
      } else {
        console.log(`User ${targetName} found but has no Minorista profile.`)
      }
    } else {
      console.log(`User ${targetName} not found.`)
    }

    // 2. Update everyone else to 0.05 (optional, but requested "everyone else 5%")
    // This ensures consistency if anyone else was accidentally changed
    const allMinoristas = await em.find(Minorista, {}, { populate: ['user'] })
    for (const m of allMinoristas) {
      if (m.user.fullName !== targetName && m.profitPercentage !== defaultProfit) {
        console.log(`Resetting ${m.user.fullName} to ${defaultProfit}...`)
        m.profitPercentage = defaultProfit
        em.persist(m)
      }
    }

    await em.flush()
    console.log('Update completed successfully!')
  } catch (error) {
    console.error('Error updating profit percentages:', error)
  } finally {
    await orm.close()
  }
}

updateMinoristaProfitByName()
