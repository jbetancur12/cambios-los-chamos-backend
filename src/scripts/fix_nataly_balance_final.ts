import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'
import { User } from '@/entities/User'

async function fixInitialBalance() {
  await initDI()
  const em = DI.orm.em.fork()

  const email = 'nathalypea@gmail.com'
  const user = await em.findOne(User, { email }, { populate: ['minorista'] })

  if (!user || !user.minorista) {
    console.log('User not found')
    return
  }

  // Find the first transaction
  const transactions = await em.find(
    MinoristaTransaction,
    { minorista: user.minorista.id },
    { orderBy: { createdAt: 'ASC' }, limit: 1 }
  )

  if (transactions.length === 0) {
    console.log('No transactions found')
    return
  }

  const firstTx = transactions[0]
  console.log(`Current First Transaction: Amount=${firstTx.amount} Type=${firstTx.type}`)

  if (firstTx.amount === -232262) {
    console.log('Updating to -432262...')
    firstTx.amount = -432262
    await em.flush()
    console.log('Update Complete.')
  } else {
    console.log('Amount matches or is different. No update needed / Check manually.')
  }

  await DI.orm.close()
}

fixInitialBalance()
