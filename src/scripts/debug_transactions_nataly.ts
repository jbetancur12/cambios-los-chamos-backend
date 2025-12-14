import { initDI, DI } from '@/di'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'
import { User } from '@/entities/User'

async function debugTransactions() {
    await initDI()
    const em = DI.orm.em.fork()

    const email = 'nathalypea@gmail.com'
    const user = await em.findOne(User, { email }, { populate: ['minorista'] })

    if (!user || !user.minorista) {
        console.log('User or Minorista not found')
        return
    }

    const transactions = await em.find(
        MinoristaTransaction,
        { minorista: user.minorista.id },
        { orderBy: { createdAt: 'ASC' } }
    )

    console.log(`Found ${transactions.length} total transactions (including CANCELLED):`)
    transactions.forEach(t => {
        console.log(`[${t.id}] ${t.createdAt.toISOString()} | ${t.type} | Amount: ${t.amount} | Status: ${t.status}`)
    })

    await DI.orm.close()
}

debugTransactions()
