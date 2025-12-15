import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'
import { User } from '@/entities/User'

async function inspectTransactions() {
  // Initialize DI first
  await initDI()

  const em = DI.orm.em.fork()

  try {
    const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      console.log('Minorista not found')
      return
    }

    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: user.minorista.id },
      {
        orderBy: { createdAt: 'DESC' },
        limit: 10,
        populate: ['createdBy'],
      }
    )

    console.log('ID | Type | Amount | Profit | Prev Bal | Curr Bal | Prev BalInFavor | Curr BalInFavor | CreatedAt')
    console.log('-'.repeat(120))

    transactions.forEach((t) => {
      console.log(
        `${t.id.substring(0, 6)} | ${t.type.padEnd(8)} | ${t.amount.toFixed(2).padStart(10)} | ${(t.profitEarned || 0).toFixed(2).padStart(8)} | ${t.previousAvailableCredit.toFixed(2).padStart(10)} | ${t.availableCredit.toFixed(2).padStart(10)} | ${(t.previousBalanceInFavor || 0).toFixed(2).padStart(10)} | ${(t.currentBalanceInFavor || 0).toFixed(2).padStart(10)} | ${t.createdAt.toISOString()}`
      )
    })
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

inspectTransactions()
