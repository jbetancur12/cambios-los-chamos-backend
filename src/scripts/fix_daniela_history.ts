import 'dotenv/config'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import config from '../mikro-orm.config'
import { Minorista } from '../entities/Minorista'
import {
  MinoristaTransaction,
  MinoristaTransactionType,
  MinoristaTransactionStatus,
} from '../entities/MinoristaTransaction'
import { User } from '../entities/User'

async function main() {
  const orm = await MikroORM.init<PostgreSqlDriver>(config)
  const em = orm.em.fork()

  const email = 'vasquezdaniela1902@gmail.com'

  // From analysis of Dec 15th closing state:
  // Debt: -696,487.10
  // Limit: 800,000
  // Available: 103,512.90
  const startAvailable = 103512.9

  console.log(`Fixing history for ${email} from Dec 16th onwards...`)
  console.log(`Setting anchor Available Credit: ${startAvailable}`)

  const user = await em.findOne(User, { email })
  if (!user) process.exit(1)
  const minorista = await em.findOne(Minorista, { user: user.id })
  if (!minorista) process.exit(1)

  const creditLimit = minorista.creditLimit
  let currentAvailable = startAvailable

  // Get all COMPLETED transactions from Dec 16th onwards
  const startDate = new Date('2025-12-16T00:00:00-05:00')

  const transactions = await em.find(
    MinoristaTransaction,
    {
      minorista: minorista.id,
      status: MinoristaTransactionStatus.COMPLETED,
      createdAt: { $gte: startDate },
    },
    {
      orderBy: { createdAt: 'ASC' },
    }
  )

  console.log(`Found ${transactions.length} transactions to re-chain.`)
  console.log('---------------------------------------------------')

  let modificationCount = 0

  for (const t of transactions) {
    const originalPrev = t.previousAvailableCredit
    const originalPost = t.availableCredit

    // Update Previous
    t.previousAvailableCredit = currentAvailable

    // Calculate Impact
    let movement = 0
    const profit = t.profitEarned || 0

    if (t.type === MinoristaTransactionType.DISCOUNT || t.type === MinoristaTransactionType.ADJUSTMENT) {
      // Debit: -Amount + Profit (Net Cost)
      movement = -t.amount + profit
    } else if (t.type === MinoristaTransactionType.RECHARGE) {
      // Credit: +Amount
      movement = t.amount
    } else if (t.type === MinoristaTransactionType.REFUND) {
      // Refund: Amount - Profit (Reverse Net Cost)
      movement = t.amount - profit
    }

    // Update Current
    currentAvailable += movement
    t.availableCredit = currentAvailable

    // Formatting for log
    const diffPrev = Math.abs(t.previousAvailableCredit - originalPrev) > 0.01
    const diffPost = Math.abs(t.availableCredit - originalPost) > 0.01

    if (diffPrev || diffPost) {
      console.log(
        `[UPDATED] ${t.id} (${t.type}): Prev ${originalPrev.toFixed(2)} -> ${t.previousAvailableCredit.toFixed(2)} | Post ${originalPost.toFixed(2)} -> ${t.availableCredit.toFixed(2)}`
      )
      modificationCount++
    }
  }

  console.log('---------------------------------------------------')
  console.log(`Total records updated: ${modificationCount}`)
  console.log(`Final Calculated Available Credit: ${currentAvailable}`)

  const finalBalance = currentAvailable - creditLimit
  console.log(`Final Implied Balance (Available - Limit): ${finalBalance}`)

  console.log(`Updating Minorista entity...`)
  minorista.availableCredit = currentAvailable

  if (currentAvailable > creditLimit) {
    minorista.creditBalance = currentAvailable - creditLimit
  } else {
    minorista.creditBalance = 0
  }

  console.log(`Minorista Available New: ${minorista.availableCredit}`)

  await em.flush()
  console.log('Done.')
  await orm.close()
}

main().catch(console.error)
