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

            // --- CLEANUP STEP 1: CANCEL MATCHING GIRO/REFUND PAIRS (Classic logic) ---
            const refunds = transactions.filter(t => t.type === MinoristaTransactionType.REFUND && t.status === MinoristaTransactionStatus.COMPLETED)

            // Buscar devoluciones de giros que nunca debieron ser visibles (es decir, el giro original debía estar PENDING)
            // Problema: Si el giro original se creó como COMPLETED por error (el bug que arreglamos), y luego se devolvio...
            // La devolución también es COMPLETED.
            // Queremos que AMBOS sean CANCANCELLED (o invisibles).

            for (const refund of refunds) {
                // Check linked giro
                if (refund.giro) {
                    await em.populate(refund, ['giro'])
                    const giro = refund.giro

                    // Si el giro asociado está DEVUELTO, y la transacción original era de tipo DISCOUNT...
                    // Deberíamos ocultar AMBAS (refund y original).
                    // Pero necesitamos encontrar la original.

                    // Buscar la transacción original vinculada al mismo giro
                    const originalTx = transactions.find(t => t.id !== refund.id && t.giro?.id === giro.id && t.type === MinoristaTransactionType.DISCOUNT)

                    if (originalTx) {
                        console.log(`[CLEANUP] Found Refund ${refund.id} linked to Giro ${giro.id}. checking status...`)
                        // Si el giro fue devuelto, significa que "no pasó".
                        // Si el fix ya fue aplicado, las nuevas devoluciones de pendientes son invisibles.
                        // Pero las antiguas son visibles.
                        // Ocultamos AMBAS si el giro está DEVUELTO.
                        if (giro.status === 'DEVUELTO' || giro.status === 'ASIGNADO' || giro.status === 'PROCESANDO') {
                            // Wait, if it's ASIGNADO/PROCESANDO, the DISCOUNT should be PENDING (invisible).
                            // If it is COMPLETED (visible), it's the bug.

                            if (originalTx.status === MinoristaTransactionStatus.COMPLETED) {
                                console.log(`[FIX] Hiding erroneously visible transaction ${originalTx.id} for Giro ${giro.id} (${giro.status})`)
                                originalTx.status = MinoristaTransactionStatus.PENDING // or CANCELLED if returned?

                                if (giro.status === 'DEVUELTO') {
                                    originalTx.status = MinoristaTransactionStatus.CANCELLED
                                    refund.status = MinoristaTransactionStatus.CANCELLED
                                    console.log(`[FIX] Also cancelling refund ${refund.id}`)
                                } else {
                                    // If still active (ASIGNADO/PROCESANDO), just make it PENDING (Hold)
                                    originalTx.status = MinoristaTransactionStatus.PENDING
                                    // Refund shouldn't exist for active giro, but if it does...
                                }
                            }
                        }
                    }
                }
            }

            // Only process ACTIVE (non-cancelled) transactions for balance
            const activeTransactions = transactions.filter(t => t.status === MinoristaTransactionStatus.COMPLETED)
            console.log(`Processing ${activeTransactions.length} active transactions (after cleanup).`)
            // --- END CLEANUP STEP ---

            // 3. Replay History
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
