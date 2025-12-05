import { DI } from '../di'
import { MikroORM } from '@mikro-orm/core'
import config from '../mikro-orm.config'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'

async function findMinorista() {
  const orm = await MikroORM.init(config)
  const em = orm.em.fork()

  try {
    const users = await em.find(User, { fullName: { $ilike: '%Jesús Segura%' } })
    console.log('Found users:', users.length)

    for (const user of users) {
      const minorista = await em.findOne(Minorista, { user: user.id })
      if (minorista) {
        console.log(`Found Minorista: ${user.fullName} (ID: ${minorista.id})`)
        console.log(`Current Profit Percentage: ${minorista.profitPercentage}`)
      } else {
        console.log(`User ${user.fullName} is not a minorista.`)
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    await orm.close()
  }
}

findMinorista()
