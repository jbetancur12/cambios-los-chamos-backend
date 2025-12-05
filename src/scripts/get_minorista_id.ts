import { initDI, DI } from '../di'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()

    const user = await em.findOne(User, { fullName: { $ilike: '%Alejandra Campos%' } })
    if (user) {
      const minorista = await em.findOne(Minorista, { user: user })
      if (minorista) {
        console.log(`MINORISTA_ID: ${minorista.id}`)
      } else {
        console.log('Minorista profile not found')
      }
    } else {
      console.log('User not found')
    }
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

run()
