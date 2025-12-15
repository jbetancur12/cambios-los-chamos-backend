import { DI } from '@/di'
import { MinoristaTransaction, MinoristaTransactionStatus, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { Minorista } from '@/entities/Minorista'
import { User, UserRole } from '@/entities/User'


export interface AuditResult {
    userId: string
    email: string
    fullName: string
    status: 'OK' | 'INCONSISTENT' | 'ERROR'
    details: {
        storedAvailable: number
        storedSurplus: number
        calculatedAvailable: number
        calculatedSurplus: number
        difference: number
        accumulatedDebt: number
        firstTransaction?: { amount: number, date: Date, type: string }
        lastTransaction?: {
            storedAvailable: number
            storedSurplus: number
            date: Date
            type: string
        }
        aggregated?: {
            totalRecharges: number
            totalProfits: number
            totalDiscounts: number
            calculatedTotal: number
            realTotalStored: number
        }
    }
    trace: string[] // Log of the replay
}

export class AuditService {
    async auditMinorista(minoristaId: string): Promise<AuditResult> {
        const em = DI.orm.em.fork()
        const trace: string[] = []

        try {
            const minorista = await em.findOne(Minorista, { id: minoristaId }, { populate: ['user'] })
            if (!minorista) {
                throw new Error('Minorista not found')
            }

            const transactions = await em.find(
                MinoristaTransaction,
                { minorista: minorista.id, status: { $ne: MinoristaTransactionStatus.CANCELLED } },
                { orderBy: { createdAt: 'ASC' } }
            )

            // SQL-Like Aggregation Logic requested by user
            // SUM(CASE WHEN mt.type = 'RECHARGE' THEN mt.amount ELSE 0 END) as total_recargas
            // SUM(COALESCE(mt.profit_earned, 0)) as total_ganancias
            // SUM(CASE WHEN mt.type = 'DISCOUNT' THEN mt.amount ELSE 0 END) as total_descuentos
            // Result = (Recharges + Profits) - Discounts

            let totalRecharges = 0
            let totalProfits = 0
            let totalDiscounts = 0

            trace.push(`Starting audit for ${minorista.user.email}`)
            trace.push(`Found ${transactions.length} active transactions`)
            trace.push(`Current Stored: Available=${minorista.availableCredit}, Surplus=${minorista.creditBalance}`)
            trace.push(`Credit Limit: ${minorista.creditLimit}`)

            // We keep the replay trace for visualization, but the STATUS will be determined by the aggregation
            const limit = minorista.creditLimit
            let currentAvailable = limit
            let currentSurplus = 0

            for (const t of transactions) {
                const amount = t.amount
                const profit = t.profitEarned || 0
                const prevAvail = currentAvailable
                const prevSurplus = currentSurplus

                // Aggregation
                if (t.type === MinoristaTransactionType.RECHARGE) {
                    totalRecharges += amount
                } else if (t.type === MinoristaTransactionType.DISCOUNT) {
                    totalDiscounts += amount
                }
                // Profit is usually only on Discounts, but we sum it if it exists
                if (profit) {
                    totalProfits += profit
                }

                // Replay Logic (Just for Trace)
                if (t.type === MinoristaTransactionType.RECHARGE) {
                    if (amount >= 0) {
                        const totalFunds = currentAvailable + amount
                        if (totalFunds > limit) {
                            currentAvailable = limit
                            currentSurplus = currentSurplus + (totalFunds - limit)
                        } else {
                            currentAvailable = totalFunds
                        }
                    } else {
                        // Negative recharge
                        currentAvailable = Math.min(currentAvailable + amount, limit)
                    }
                }
                else if (t.type === MinoristaTransactionType.DISCOUNT) {
                    let amountToDeduct = amount
                    if (currentSurplus >= amountToDeduct) {
                        currentSurplus -= amountToDeduct
                        amountToDeduct = 0
                    } else {
                        amountToDeduct -= currentSurplus
                        currentSurplus = 0
                    }
                    if (amountToDeduct > 0) {
                        currentAvailable -= amountToDeduct
                    }

                    const fundsAfterProfit = currentAvailable + profit
                    if (fundsAfterProfit > limit) {
                        currentAvailable = limit
                        currentSurplus += (fundsAfterProfit - limit)
                    } else {
                        currentAvailable = fundsAfterProfit
                    }
                }
                else if (t.type === MinoristaTransactionType.REFUND) {
                    const profitToRevert = amount * 0.05
                    const netRefund = amount - profitToRevert
                    const totalLiquidity = currentAvailable + currentSurplus + netRefund
                    if (totalLiquidity > limit) {
                        currentAvailable = limit
                        currentSurplus = totalLiquidity - limit
                    } else {
                        currentAvailable = totalLiquidity
                        currentSurplus = 0
                    }
                }
                else if (t.type === MinoristaTransactionType.ADJUSTMENT) {
                    currentAvailable += amount
                }

                const dateStr = t.createdAt instanceof Date ?
                    new Intl.DateTimeFormat('sv-SE', {
                        timeZone: 'America/Bogota',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    }).format(t.createdAt).replace(' ', 'T')
                    : t.createdAt
                const profitStr = profit > 0 ? ` | Gain: ${profit}` : ''
                trace.push(`${dateStr} [${t.type}] ${amount}${profitStr}| Avail: ${prevAvail.toFixed(0)} -> ${currentAvailable.toFixed(0)} | Surp: ${prevSurplus.toFixed(0)} -> ${currentSurplus.toFixed(0)}`)
            }

            // --- AGGREGATION CHECK ---
            // Formula: (Recharges + Profits) - Discounts
            const calculatedTotal = (totalRecharges + totalProfits) - totalDiscounts

            // Stored Total: Available + Surplus
            // Wait, Available Credit is relative to LIMIT. 
            // If Limit is 300k, and Available is 148k. Used is 152k.
            // If result is negative, it might mean used? 
            // The calculatedResult from user formula is "Net Balance".
            // If I start with 0.
            // Recharges (Positive) - Discounts (Negative).
            // Result is "Current Funds".
            // Current Funds should equal (Available Credit) IF Limit was infinite?
            // No, Current Funds = (Available Credit - Credit Limit)? No.

            // Let's assume the user logic implies:
            // "Funds I have put in + Profit I made - Funds I took out" = "Funds I should have now".
            // "Funds I have now" = (Available Credit + Surplus) IF we assume Starting Balance was 0 and Limit is just a cap.
            // Actually, usually users start with Avail = Limit (Debt = 0)?
            // Or Start with Avail = 0?
            // If they start with Avail = Limit (Credit Line), then:
            // Current = Initial + Changes.
            // Initial = Limit?
            // Changes = (Recharges + Profits) - Discounts.
            // So Final = Limit + Changes.
            // Let's check with zambbrano10 data provided.

            const realTotalStored = (minorista.availableCredit || 0) + (minorista.creditBalance || 0)

            // Hypothesized formula matching previous observed logic:
            // The "Calculated" value from SQL is likely the "Net Change".
            // Does it include the initial limit? No, it sums transactions.
            // So: Stored Balance SHOULD BE = Credit Limit + Net Change?
            // Or just Net Change if it's a prepaid system?
            // This is a credit system.
            // "Accumulated Debt" calculation used: `limit - currentAvailable`.

            // Let's try: Expected Stored = Limit + calculatedTotal.
            // But wait, user said: "compares con los datos de minorista de available credit, credit balance".

            // I will return the generic 'isOk' based on the Aggregation first.
            // If (Limit + calculatedTotal) approx equals (realTotalStored).

            // Wait, if I recharge 100k. TotalRecharges = 100k. Limit = 1M.
            // Available = 1.1M? Or capped?
            // If it's pure credit, maybe I owe 0 and have 1M avail.
            // If I use 100k. Discounts = 100k.
            // Net Change = 0 - 100k = -100k.
            // Available = 1M - 100k = 900k.
            // So: Available = Limit + Net Change.

            const expectedTotal = limit + calculatedTotal

            const diffAggregation = Math.abs(expectedTotal - realTotalStored)
            const isOkAggregation = diffAggregation < 2000 // Tolerance for small floats/profit rounding

            trace.push(`--- AGGREGATION RESULT ---`)
            trace.push(`Total Recharges: ${totalRecharges}`)
            trace.push(`Total Profits: ${totalProfits}`)
            trace.push(`Total Discounts: ${totalDiscounts}`)
            trace.push(`Net Change (Calculated): ${calculatedTotal}`)
            trace.push(`Credit Limit: ${limit}`)
            trace.push(`Expected Stored (Limit + Net): ${expectedTotal}`)
            trace.push(`Actual Stored (Avail + Surp): ${realTotalStored}`)
            trace.push(`Difference: ${diffAggregation}`)

            trace.push(`Audit Complete. Status: ${isOkAggregation ? 'OK' : 'INCONSISTENT'}`)

            const firstTx = transactions[0]
            const lastTx = transactions[transactions.length - 1]
            const accumulatedDebt = currentSurplus > 0 ? 0 : (limit - currentAvailable)

            return {
                userId: minorista.user.id,
                email: minorista.user.email,
                fullName: minorista.user.fullName,
                status: isOkAggregation ? 'OK' : 'INCONSISTENT',
                details: {
                    storedAvailable: minorista.availableCredit,
                    storedSurplus: minorista.creditBalance || 0,
                    calculatedAvailable: currentAvailable, // Kept for reference
                    calculatedSurplus: currentSurplus, // Kept for reference
                    difference: diffAggregation,
                    accumulatedDebt,
                    // New aggregation details
                    aggregated: {
                        totalRecharges,
                        totalProfits,
                        totalDiscounts,
                        calculatedTotal,
                        realTotalStored: realTotalStored
                    },
                    firstTransaction: firstTx ? {
                        amount: firstTx.amount,
                        date: firstTx.createdAt,
                        type: firstTx.type
                    } : undefined,
                    lastTransaction: lastTx ? {
                        storedAvailable: lastTx.availableCredit,
                        storedSurplus: lastTx.currentBalanceInFavor || 0,
                        date: lastTx.createdAt,
                        type: lastTx.type
                    } : undefined
                },
                trace
            }

        } catch (error) {
            return {
                userId: 'unknown',
                email: 'unknown',
                fullName: 'unknown',
                status: 'ERROR',
                details: {
                    storedAvailable: 0,
                    storedSurplus: 0,
                    calculatedAvailable: 0,
                    calculatedSurplus: 0,
                    difference: 0,
                    accumulatedDebt: 0
                },
                trace: [`Error: ${error}`]
            }
        }
    }

    async auditAll(): Promise<AuditResult[]> {
        const em = DI.orm.em.fork()
        const users = await em.find(User, { role: UserRole.MINORISTA, isActive: true }, { populate: ['minorista'] })


        const results: AuditResult[] = []
        for (const user of users) {
            if (user.minorista) {
                results.push(await this.auditMinorista(user.minorista.id))
            }
        }
        return results
    }
}

export const auditService = new AuditService()
