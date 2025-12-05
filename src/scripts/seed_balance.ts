import { MikroORM } from '@mikro-orm/core'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import mikroOrmConfig from '../mikro-orm.config'

const usersEmails = [
  'mayerlinrocam@gmail.com',
  'odalisg024@gmail.com',
  'rosyerazo.51@gmail.com',
  'toledostefanny65@gmail.com',
  'fredyrobotina@hotmail.com',
]

async function seedBalance() {
  const orm = await MikroORM.init(mikroOrmConfig)
  const em = orm.em.fork()

  console.log('Seeding balances...')

  for (const email of usersEmails) {
    const user = await em.findOne(User, { email }, { populate: ['minorista'] })
    if (user && user.minorista) {
      user.minorista.availableCredit = 1000000000
      user.minorista.creditLimit = 1000000000
      console.log(`Updated credit for ${email}`)
    } else {
      console.error(`User or Minorista not found: ${email}`)
    }
  }

  await em.flush()
  await orm.close()
  console.log('Balance seeding complete.')
}

seedBalance().catch(console.error)
