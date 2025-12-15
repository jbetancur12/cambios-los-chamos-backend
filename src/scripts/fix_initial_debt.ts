import { initDI, DI } from '@/di'
import { User } from '@/entities/User'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'

async function fixInitialDebt() {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      console.log('Minorista not found')
      return
    }

    const minorista = user.minorista

    // Find the initial negative recharge
    // We search by rough amount in case of float issues, or exact.
    // Amount was -232262.
    // Integer search is safe.
    const initialTx = await em.findOne(MinoristaTransaction, {
      minorista: minorista.id,
      type: MinoristaTransactionType.RECHARGE,
      amount: -232262,
    })

    if (initialTx) {
      console.log(`Found initial transaction ${initialTx.id}. Updating amount...`)
      initialTx.amount = -432262
      await em.persistAndFlush(initialTx)
      console.log('Amount updated to -432262. Please run recalculation.')
    } else {
      console.log('Initial transaction -232262 not found. Already fixed?')
      // Check if -432262 exists
      const fixedTx = await em.findOne(MinoristaTransaction, {
        minorista: minorista.id,
        type: MinoristaTransactionType.RECHARGE,
        amount: -432262,
      })
      if (fixedTx) console.log('Transaction already -432262.')
    }
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

fixInitialDebt()
