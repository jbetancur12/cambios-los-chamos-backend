import { initDI, DI } from '../di'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import { MinoristaTransaction } from '../entities/MinoristaTransaction'
import { Giro } from '../entities/Giro'
import { logger } from '../lib/logger'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()

    logger.info('--- CHECKING TRANSACTIONS FOR ALEJANDRA CAMPOS ---')

    // 1. Find User
    const user = await em.findOne(User, { fullName: { $ilike: '%Alejandra Campos%' } })
    if (!user) {
      logger.error('User "Alejandra Campos" not found.')
      return
    }
    logger.info(`User Found: ${user.fullName} (ID: ${user.id}, Role: ${user.role})`)

    // 2. Find Minorista profile
    const minorista = await em.findOne(Minorista, { user: user })
    if (!minorista) {
      logger.error('Minorista profile not found for this user.')
    } else {
      logger.info(`Minorista Profile Found: ID ${minorista.id}`)

      // 3. Check Minorista Transactions
      const transactions = await em.find(
        MinoristaTransaction,
        { minorista: minorista },
        { orderBy: { createdAt: 'DESC' }, limit: 10, populate: ['minorista'] }
      )
      logger.info(`Found ${transactions.length} MinoristaTransactions for Minorista ID ${minorista.id}:`)
      transactions.forEach((t) => {
        logger.info(
          `- [${t.createdAt.toISOString()}] ID: ${t.id}, Type: ${t.type}, Amount: ${t.amount}, MinoristaID: ${t.minorista.id}`
        )
      })
    }

    // 4. Check Giros created by user
    const giros = await em.find(Giro, { createdBy: user }, { orderBy: { createdAt: 'DESC' }, limit: 10 })
    logger.info(`Found ${giros.length} Giros created by user:`)
    giros.forEach((g) => {
      logger.info(`- [${g.createdAt.toISOString()}] ID: ${g.id}, Status: ${g.status}, Amount: ${g.amountBs}`)
    })
  } catch (error) {
    logger.error({ error }, 'Unexpected error')
  } finally {
    await DI.orm.close()
  }
}

run()
