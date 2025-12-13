import 'reflect-metadata'
import { MikroORM, RequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql' // Or your driver
import config from '../src/mikro-orm.config'
import { Minorista } from '../src/entities/Minorista'
import { MinoristaTransaction, MinoristaTransactionType, MinoristaTransactionStatus } from '../src/entities/MinoristaTransaction'

async function main() {
    const orm = await MikroORM.init(config)
    const em = orm.em.fork() as EntityManager

    console.log('Starting balance recalculation...')

    try {
        // 1. Get all Minoristas
        const minoristas = await em.find(Minorista, {})
        console.log(`Found ${minoristas.length} minoristas.`)

        for (const minorista of minoristas) {
            console.log(`Processing Minorista: ${minorista.id} (Limit: ${minorista.creditLimit})`)

            // 2. Get all transactions for this minorista, ordered by creation time ASC
            // Only COMPLETED transactions affect the running balance logic usually, 
            // but let's grab all to be sure we handle sequence correctly.
            // Status PENDING usually doesn't affect balance yet. CANCELLED doesn't either.
            const transactions = await em.find(
                MinoristaTransaction,
                {
                    minorista: minorista.id,
                    status: MinoristaTransactionStatus.COMPLETED
                },
                { orderBy: { createdAt: 'ASC' } }
            )

            console.log(`Found ${transactions.length} completed transactions.`)

            // 3. Replay History
            // Reset state to "Zero" or initial state logic?
            // Usually starts with availableCredit = 0 (or some initial state), and balanceInFavor = 0.
            // However, minorista.creditLimit is a constant setting (unless it changed over time, which we don't track easily).
            // We will assume creditLimit has been constant or at least is the target for "full".

            // Initial State:
            // When a user starts, availableCredit is usually 0? Or do they start with full credit?
            // Usually they start with 0 used, meaning available = creditLimit?
            // Wait, "Available Credit" means "How much I can spend". so it starts at Credit Limit?
            // Or does it start at 0 and they have to recharge?
            // Based on the app logic: 
            // "Cupo Asignado" is the limit.
            // "Crédito Disponible" is what they have.
            // If I assign 1.2M, do they instantly have 1.2M to spend? 
            // Usually "Cupo" implies a debt limit. 
            // BUT current logic in the app seems to treat 'AvailableCredit' as funds.
            // If I have 1.2M limit, and 0 debt, my Available Credit is 1.2M?
            // Let's check a specialized detail:
            // In `MinoristaTransactionService`:
            // `realDebt = newBalanceInFavor > 0 ? 0 : creditLimit - newAvailableCredit`
            // This implies: AvailableCredit + Debt = Limit.
            // So if Debt is 0, AvailableCredit = Limit.
            // Let's assume initial state: AvailableCredit = CreditLimit. BalanceInFavor = 0.

            let currentAvailableCredit = minorista.creditLimit
            let currentBalanceInFavor = 0
            let currentAccumulatedProfit = 0

            // HOWEVER, if the user historically started with 0 and built up?
            // We should check the very first transaction.
            // If transactions represent changes, we need a base.
            // Let's assume the base is the full limit (no debt) unless established otherwise.
            // Or better: Re-calculate strictly based on deltas?
            // No, we need absolute values because of the capping logic.

            // Let's assume Start State = Perfect State (Full Credit available, No Debt)
            // UNLESS the first transaction implies otherwise.
            // But usually, a new account has 0 debt.

            for (const tx of transactions) {
                const limit = minorista.creditLimit

                // Capture previous state (for the record)
                tx.previousAvailableCredit = currentAvailableCredit
                tx.previousBalanceInFavor = currentBalanceInFavor

                let newAvailable = currentAvailableCredit
                let newBalance = currentBalanceInFavor

                // Apply Delta Logic
                if (tx.type === MinoristaTransactionType.RECHARGE) {
                    // Logic: Fill Cupo, then Spill to Balance
                    // tx.amount can be positive or negative? Assuming positive for recharge.
                    const gap = limit - currentAvailableCredit

                    // Total funds after add
                    const totalFunds = currentAvailableCredit + tx.amount

                    if (totalFunds > limit) {
                        newAvailable = limit
                        newBalance = currentBalanceInFavor + (totalFunds - limit)
                    } else {
                        newAvailable = totalFunds
                        newBalance = currentBalanceInFavor
                    }

                    // Recargas reset accumulated profit?
                    // "accumulatedProfit = 0 // Reinicia en recarga" -> From Service
                    currentAccumulatedProfit = 0

                } else if (tx.type === MinoristaTransactionType.DISCOUNT) {
                    // Logic: Spend Money (Amount), Gain Profit (Amount * 0.05)

                    // 1. Spend (Amount)
                    let amountToPay = tx.amount

                    // Use Balance First
                    if (currentBalanceInFavor >= amountToPay) {
                        newBalance = currentBalanceInFavor - amountToPay
                        // Available stays same
                    } else {
                        amountToPay -= currentBalanceInFavor
                        newBalance = 0
                        // Use Credit
                        newAvailable = currentAvailableCredit - amountToPay
                    }

                    // 2. Add Profit
                    const profit = tx.profitEarned // Value stored in DB is likely correct (5%), we trust it or recalculate?
                    // Let's recalculate to be safe:
                    const calcProfit = tx.amount * 0.05
                    // Update profitEarned just in case it was wrong?
                    // tx.profitEarned = calcProfit 

                    // Logic: Add Profit to Available first, then Spill
                    const fundsAfterProfit = newAvailable + calcProfit
                    if (fundsAfterProfit > limit) {
                        newAvailable = limit
                        newBalance = newBalance + (fundsAfterProfit - limit)
                    } else {
                        newAvailable = fundsAfterProfit
                    }

                    currentAccumulatedProfit += calcProfit

                } else if (tx.type === MinoristaTransactionType.ADJUSTMENT) {
                    // Direct adjustment to credit?
                    newAvailable = currentAvailableCredit + tx.amount
                    // Check cap? Adjustments might break rules?
                    // Let's enforce cap rule as well to be consistent.
                    if (newAvailable > limit) {
                        newBalance = currentBalanceInFavor + (newAvailable - limit)
                        newAvailable = limit
                    }
                } else if (tx.type === MinoristaTransactionType.REFUND) {
                    // Reembolso: (Amount - Profit) back to funds
                    // Assuming simplified refund login: Amount flows back.
                    // But we must deduct the profit we gave them?
                    const profitToRevert = tx.amount * 0.05
                    const netRefund = tx.amount - profitToRevert

                    const totalFunds = currentAvailableCredit + currentBalanceInFavor + netRefund
                    if (totalFunds > limit) {
                        newAvailable = limit
                        newBalance = totalFunds - limit
                    } else {
                        newAvailable = totalFunds
                        newBalance = 0
                    }
                }

                // Update Transaction Record
                tx.availableCredit = newAvailable
                tx.currentBalanceInFavor = newBalance

                const realDebt = newBalance > 0 ? 0 : limit - newAvailable
                tx.accumulatedDebt = realDebt
                tx.accumulatedProfit = currentAccumulatedProfit

                // Update State for next loop
                currentAvailableCredit = newAvailable
                currentBalanceInFavor = newBalance
            } // End Transactions Loop

            // 4. Update Minorista Final State
            minorista.availableCredit = currentAvailableCredit
            minorista.creditBalance = currentBalanceInFavor

            // Persist changes
            em.persist(transactions)
            em.persist(minorista)

        } // End Minoristas Loop

        console.log('Flushing changes to database...')
        await em.flush()
        console.log('Recalculation complete.')

    } catch (error) {
        console.error('Error in recalculation:', error)
    } finally {
        await orm.close()
    }
}

main()
