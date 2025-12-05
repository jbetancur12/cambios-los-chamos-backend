import { initDI, DI } from '../di'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { Giro } from '../entities/Giro'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()

    console.log('--- CHECKING TRANSACTIONS FOR ALEJANDRA CAMPOS ---')

    // 1. Find User
    const user = await em.findOne(User, { fullName: { $ilike: '%Alejandra Campos%' } })
    if (!user) {
      console.error('User "Alejandra Campos" not found.')
      return
    }
    console.log(`User Found: ${user.fullName} (ID: ${user.id}, Role: ${user.role})`)

    // 2. Find Minorista profile
    const minorista = await em.findOne(Minorista, { user: user })
    if (!minorista) {
      console.error('Minorista profile not found for this user.')
    } else {
      console.log(`Minorista Profile Found: ID ${minorista.id}`)

      // 3. Check Minorista Transactions
      const transactions = await em.find(
        MinoristaTransaction,
        { minorista: minorista },
        { orderBy: { createdAt: 'DESC' }, limit: 10, populate: ['minorista'] }
      )
      console.log(`Found ${transactions.length} MinoristaTransactions for Minorista ID ${minorista.id}:`)
      transactions.forEach((t) => {
        console.log(
          `- [${t.createdAt.toISOString()}] ID: ${t.id}, Type: ${t.type}, Amount: ${t.amount}, MinoristaID: ${t.minorista.id}`
        )
      })
    }

    // 4. Check Giros created by user
    const giros = await em.find(Giro, { createdBy: user }, { orderBy: { createdAt: 'DESC' }, limit: 10 })
    console.log(`Found ${giros.length} Giros created by user:`)
    giros.forEach((g) => {
      console.log(`- [${g.createdAt.toISOString()}] ID: ${g.id}, Status: ${g.status}, Amount: ${g.amountBs}`)
    })
  } catch (error) {
    console.error('Unexpected error:', error)
  } finally {
    await DI.orm.close()
  }
}

run()
