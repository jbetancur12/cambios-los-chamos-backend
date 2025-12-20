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

  const email = 'orligginau@gmail.com'

  // Anchor from investigation: Dec 12th Start
  // Balance was clean at that point.
  // Previous Available Credit of the first transaction on Dec 12 (16:46) was 296,115.00
  const startAvailable = 296115.0

  console.log(`Fixing history for ${email} from Dec 12th onwards...`)
  console.log(`Setting anchor Available Credit: ${startAvailable}`)

  const user = await em.findOne(User, { email })
  if (!user) process.exit(1)
  const minorista = await em.findOne(Minorista, { user: user.id })
  if (!minorista) process.exit(1)

  const creditLimit = minorista.creditLimit
  let currentAvailable = startAvailable

  // Get all COMPLETED transactions from Dec 12th onwards
  const startDate = new Date('2025-12-12T00:00:00-05:00')

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

  console.log(`Found ${transactions.length} COMPLETED transactions to re-chain.`)
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
      // Debit: -Amount + Profit
      movement = -t.amount + profit
    } else if (t.type === MinoristaTransactionType.RECHARGE) {
      // Credit: +Amount
      movement = t.amount
    } else if (t.type === MinoristaTransactionType.REFUND) {
      // Refund: +Amount - Profit (Restores the net cost of the original discount)
      // Wait. Standard logic for Refund in this system:
      // If I made a discount of 100 (Profit 5), cost was 95.
      // Refund should give back 95.
      // So Refund movement = Amount - Profit?
      // Let's verify commonly used logic.
      // In fix_yamileth_history: movement = t.amount (Recharge/Refund grouped).
      // BUT Refund usually has profit attached (the profit to reverse).
      // If Transaction says "Amount 100, Profit 5".
      // Recharging 100? Or 95?
      // Let's look at `investigation_daniela.txt` logic or `AuditService.ts`.
      // AuditService: `netRefund = amount - profitToRevert`.
      // fix_yamileth_history logic: `movement = t.amount`. This might have been loose.
      // Let's check `fix_daniela_history.ts`: I wrote `movement = t.amount - profit`.
      // This seems correct for strict accounting. Refund should reverse the discount exactly.
      movement = t.amount - profit
    }

    // Update Current
    currentAvailable += movement
    t.availableCredit = currentAvailable

    // Formatting for log
    const diffPrev = Math.abs(t.previousAvailableCredit - originalPrev) > 0.01
    const diffPost = Math.abs(t.availableCredit - originalPost) > 0.01

    if (diffPrev || diffPost) {
      // console.log(`[UPDATED] ${t.id} (${t.type}): Prev ${originalPrev.toFixed(2)} -> ${t.previousAvailableCredit.toFixed(2)} | Post ${originalPost.toFixed(2)} -> ${t.availableCredit.toFixed(2)}`)
      modificationCount++
    }
  }

  console.log('---------------------------------------------------')
  console.log(`Total records updated chains: ${modificationCount}`)
  console.log(`Final Calculated Available Credit: ${currentAvailable}`)

  const finalBalance = currentAvailable - creditLimit
  console.log(`Final Implied Balance (Available - Limit): ${finalBalance}`)
  console.log(`Final Implied Debt: ${finalBalance < 0 ? -finalBalance : 0}`)

  console.log(`Updating Minorista entity...`)
  console.log(`Minorista Available Old: ${minorista.availableCredit}`)
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
