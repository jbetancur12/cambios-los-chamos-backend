import { initDI, DI } from '../di'
import { User } from '../entities/User'
import { Minorista } from '../entities/Minorista'
import { MinoristaTransaction, MinoristaTransactionType } from '../entities/MinoristaTransaction'

async function run() {
  try {
    await initDI()
    const em = DI.orm.em.fork()

    // Override DI repositories with forked EM
    ;(DI as any).em = em
    DI.users = em.getRepository(User) as any
    DI.minoristas = em.getRepository(Minorista) as any
    DI.minoristaTransactions = em.getRepository(MinoristaTransaction) as any

    console.log('--- STARTING BALANCE FIX SCRIPT ---')

    const email = 'andreinacampos0510@gmail.com' // The user reported this email
    const user = await em.findOne(User, { email })

    if (!user) {
      console.error(`User with email ${email} not found.`)
      return
    }

    const minorista = await em.findOne(Minorista, { user })
    if (!minorista) {
      console.error(`Minorista profile not found for user ${email}.`)
      return
    }

    console.log(`Checking Minorista: ${user.fullName} (${user.email})`)
    console.log(
      `Current State: CreditLimit=${minorista.creditLimit}, Available=${minorista.availableCredit}, CreditBalance=${minorista.creditBalance}`
    )

    // Fetch all transactions ordered by date
    const transactions = await em.find(MinoristaTransaction, { minorista }, { orderBy: { createdAt: 'ASC' } })

    console.log(`Found ${transactions.length} transactions.`)

    // Replay transactions
    // We need to know the initial state.
    // Assuming the initial state was: Available = CreditLimit, CreditBalance = 0.
    // OR we can trust the 'previousAvailableCredit' of the FIRST transaction if it exists.

    let calculatedAvailable = minorista.creditLimit
    let calculatedCreditBalance = 0

    // If there are transactions, let's try to deduce the starting point.
    // Usually, a new minorista starts with Available = CreditLimit.
    // But if they had debt assigned manually without a transaction?
    // The safest bet is to replay the logic.

    // However, the bug was that the Minorista entity wasn't updated, but the Transaction record MIGHT have the correct "accumulatedDebt" or "availableCredit" stored in it?
    // Let's look at the transactions.

    for (const t of transactions) {
      console.log(`Tx ${t.id} (${t.type}): Amount=${t.amount}, Profit=${t.profitEarned}`)

      // We can either trust the transaction's stored "availableCredit" (if it was calculated correctly in memory)
      // or recalculate it.
      // Since the bug was "em.refresh" discarding changes to the Minorista entity,
      // the Transaction entity (which was persisted) SHOULD have the correct values calculated at that time.

      // Let's check the last transaction's stored availableCredit
    }

    if (transactions.length > 0) {
      const lastTx = transactions[transactions.length - 1]
      console.log(
        `Last Transaction Stored State: Available=${lastTx.availableCredit}, CreditBalance=${lastTx.currentBalanceInFavor}`
      )

      if (Math.abs(lastTx.availableCredit - minorista.availableCredit) > 1) {
        console.log(
          `MISMATCH DETECTED! Minorista entity has ${minorista.availableCredit}, but last transaction says ${lastTx.availableCredit}.`
        )

        console.log('Fixing Minorista entity...')
        minorista.availableCredit = lastTx.availableCredit
        minorista.creditBalance = lastTx.currentBalanceInFavor || 0

        await em.persistAndFlush(minorista)
        console.log('FIX APPLIED.')
      } else {
        console.log('No mismatch detected. The balance seems consistent with the last transaction.')
      }
    } else {
      console.log('No transactions found. Cannot recalculate.')
    }
  } catch (error) {
    console.error('Unexpected error:', error)
  } finally {
    await DI.orm.close()
  }
}

run()
