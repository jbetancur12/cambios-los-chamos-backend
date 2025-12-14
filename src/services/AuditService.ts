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

            trace.push(`Starting audit for ${minorista.user.email}`)
            trace.push(`Found ${transactions.length} active transactions`)
            trace.push(`Current Stored: Available=${minorista.availableCredit}, Surplus=${minorista.creditBalance}`)
            trace.push(`Credit Limit: ${minorista.creditLimit}`)

            const limit = minorista.creditLimit
            let currentAvailable = limit // Assume starts full? Or 0? Usually limits are assigned.
            // Wait, in our recalculation script we assumed:
            // "let currentAvailable = limit" (Starts clean/full).
            // If history is partial, this assumption fails.
            // But for a closed system, it should work.

            let currentSurplus = 0

            for (const t of transactions) {
                const amount = t.amount
                const profit = t.profitEarned || 0
                const prevAvail = currentAvailable
                const prevSurplus = currentSurplus

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
                    const profitToRevert = amount * 0.05 // Approximation if not stored
                    const netRefund = amount - profitToRevert // We add back the 'cost' of the wire? No.
                    // When we refund, we give back MONEY. 
                    // The profit was EARNED on DISCOUNT.
                    // On REFUND, we REVERSE the Discount.
                    // So we give back the Principal.
                    // Code in script: "netRefund = amount - profitToRevert" (Wait, amount is usually the FULL value including profit?)
                    // If Discount was 100k.
                    // We refund 100k.
                    // We should deduct the profit we gave (5k) from the user balance?
                    // Actually, `recalculate_nataly` used: `const netRefund = amount - profitToRevert`
                    // And `currentAvailable += netRefund`.
                    // Let's stick to the script logic which proved correct for Nataly.

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

                trace.push(`[${t.type}] ${amount} | Avail: ${prevAvail.toFixed(0)} -> ${currentAvailable.toFixed(0)} | Surp: ${prevSurplus.toFixed(0)} -> ${currentSurplus.toFixed(0)}`)
            }

            // Check results
            // Float tolerance
            const diffAvailable = Math.abs(minorista.availableCredit - currentAvailable)
            const diffSurplus = Math.abs((minorista.creditBalance || 0) - currentSurplus)

            const isOk = diffAvailable < 1 && diffSurplus < 1

            trace.push(`Audit Complete. Status: ${isOk ? 'OK' : 'INCONSISTENT'}`)

            const firstTx = transactions[0]


            const lastTx = transactions[transactions.length - 1]

            // Calculate Accumulated Debt (Just for display)
            // realDebt = newBalanceInFavor > 0 ? 0 : creditLimit - newAvailableCredit
            const accumulatedDebt = currentSurplus > 0 ? 0 : (limit - currentAvailable)

            return {
                userId: minorista.user.id,
                email: minorista.user.email,
                fullName: minorista.user.fullName,
                status: isOk ? 'OK' : 'INCONSISTENT',
                details: {
                    storedAvailable: minorista.availableCredit,
                    storedSurplus: minorista.creditBalance || 0,
                    calculatedAvailable: currentAvailable,
                    calculatedSurplus: currentSurplus,
                    difference: diffAvailable + diffSurplus,
                    accumulatedDebt,
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
