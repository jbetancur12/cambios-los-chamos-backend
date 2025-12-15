import { DI } from '@/di'
import {
  MinoristaTransaction,
  MinoristaTransactionStatus,
  MinoristaTransactionType,
} from '@/entities/MinoristaTransaction'
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
    firstTransaction?: { amount: number; date: Date; type: string }
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
    dailyStats?: {
      targetDate: string
      initialBalance: number // Net Balance at 5 AM
      transactionsCount: number
      dayTotalRecharges: number
      dayTotalProfits: number
      dayTotalDiscounts: number
      dayNetChange: number
      finalBalance: number // Initial + Net Change
    }
  }
  trace: string[] // Log of the replay
}

export class AuditService {
  async auditMinorista(minoristaId: string, targetDate?: string): Promise<AuditResult> {
    const em = DI.orm.em.fork()
    const trace: string[] = []

    try {
      const minorista = await em.findOne(Minorista, { id: minoristaId }, { populate: ['user'] })
      if (!minorista) {
        throw new Error('Minorista not found')
      }

      // Find all transactions generally for global history replay (needed for initial state calculation)
      const transactions = await em.find(
        MinoristaTransaction,
        { minorista: minorista.id, status: { $ne: MinoristaTransactionStatus.CANCELLED } },
        { orderBy: { createdAt: 'ASC' } }
      )

      trace.push(`Starting audit for ${minorista.user.email}`)
      if (targetDate) {
        trace.push(`Target Date: ${targetDate} (Operational Day: 5 AM - 5 AM Next Day)`)
      }
      trace.push(`Found ${transactions.length} total active transactions`)
      trace.push(`Current Stored: Available=${minorista.availableCredit}, Surplus=${minorista.creditBalance}`)
      trace.push(`Credit Limit: ${minorista.creditLimit}`)

      let startDate: Date | undefined
      let endDate: Date | undefined

      if (targetDate) {
        // Parse date (Assuming YYYY-MM-DD)
        // We want 5 AM Bogota time.
        // Bogota is UTC-5.
        // 05:00 Bogota = 10:00 UTC.
        const [year, month, day] = targetDate.split('-').map(Number)

        // Start: targetDate 10:00 UTC
        startDate = new Date(Date.UTC(year, month - 1, day, 10, 0, 0))

        // End: targetDate+1 09:59:59 UTC
        endDate = new Date(Date.UTC(year, month - 1, day + 1, 9, 59, 59, 999))
      }

      // State variables for Global Replay (to calculate initial state if date filtered)
      // Or just to replay history.

      // We need to replay EVERYTHING to know the state at `startDate`.
      // Because balance depends on previous history (limit caps, surplus buckets etc).

      let limit = minorista.creditLimit
      let currentAvailable = limit
      let currentSurplus = 0

      // Daily Stats Accumulators
      let dayRecharges = 0
      let dayProfits = 0
      let dayDiscounts = 0
      let dayTxCount = 0

      // Global verify accumulators
      let totalRecharges = 0
      let totalProfits = 0
      let totalDiscounts = 0

      // Capture initial state
      let initialBalanceAtStartOfDay = 0
      let capturedInitial = false

      for (const t of transactions) {
        const txDate = t.createdAt
        const isBeforeStart = startDate ? txDate < startDate : false
        const isAfterEnd = endDate ? txDate > endDate : false
        const inWindow = !isBeforeStart && !isAfterEnd

        // Global Aggregations (Always run for global integrity check)
        const amount = t.amount
        const profit = t.profitEarned || 0

        if (t.type === MinoristaTransactionType.RECHARGE) {
          totalRecharges += amount
        } else if (t.type === MinoristaTransactionType.DISCOUNT) {
          totalDiscounts += amount
        }
        if (profit) totalProfits += profit

        // Logic Replay
        const prevAvail = currentAvailable
        const prevSurplus = currentSurplus

        // If we hit the start date, capture the "Initial Balance"
        if (startDate && !capturedInitial && txDate >= startDate) {
          // Net Balance = (CurrentAvailable - Limit) + CurrentSurplus ?
          // Or just (Available + Surplus).
          // Usually "Balance" means "Debt" or "Favor".
          // Let's store "Net Liquidity" = (Available + Surplus) - Limit (which is 0 if aligned, positive if favor, negative if debt)
          initialBalanceAtStartOfDay = currentAvailable + currentSurplus - limit
          capturedInitial = true
          trace.push(`--- START OF DAY (${targetDate}) ---`)
          trace.push(
            `Initial State @ 5AM: Avail=${currentAvailable.toFixed(0)}, Surplus=${currentSurplus.toFixed(0)}, Net=${initialBalanceAtStartOfDay.toFixed(0)}`
          )
        }

        // Replay State Logic
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
            currentAvailable = Math.min(currentAvailable + amount, limit)
          }
        } else if (t.type === MinoristaTransactionType.DISCOUNT) {
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
            currentSurplus += fundsAfterProfit - limit
          } else {
            currentAvailable = fundsAfterProfit
          }
        } else if (t.type === MinoristaTransactionType.REFUND) {
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
        } else if (t.type === MinoristaTransactionType.ADJUSTMENT) {
          currentAvailable += amount
        }

        // Trace & Accumulate ONLY if in window (or if no window set)
        if (inWindow) {
          if (targetDate) {
            dayTxCount++
            if (t.type === MinoristaTransactionType.RECHARGE) dayRecharges += amount
            if (t.type === MinoristaTransactionType.DISCOUNT) dayDiscounts += amount
            if (profit) dayProfits += profit
          }

          const dateStr =
            t.createdAt instanceof Date
              ? new Intl.DateTimeFormat('sv-SE', {
                  timeZone: 'America/Bogota',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                  .format(t.createdAt)
                  .replace(' ', 'T')
              : t.createdAt
          const profitStr = profit > 0 ? ` | Gain: ${profit}` : ''
          trace.push(
            `${dateStr} [${t.type}] ${amount}${profitStr}| Avail: ${prevAvail.toFixed(0)} -> ${currentAvailable.toFixed(0)} | Surp: ${prevSurplus.toFixed(0)} -> ${currentSurplus.toFixed(0)}`
          )
        }
      } // End Loop

      // If we never captured initial (e.g. all transactions are before start), capture now at end
      if (startDate && !capturedInitial) {
        initialBalanceAtStartOfDay = currentAvailable + currentSurplus - limit
        trace.push(`--- START OF DAY (${targetDate}) ---`)
        trace.push(
          `Initial State @ 5AM: Avail=${currentAvailable.toFixed(0)}, Surplus=${currentSurplus.toFixed(0)}, Net=${initialBalanceAtStartOfDay.toFixed(0)}`
        )
        trace.push(`No transactions found in this day window.`)
      }

      // Global Check
      const calculatedTotal = totalRecharges + totalProfits - totalDiscounts
      const realTotalStored = (minorista.availableCredit || 0) + (minorista.creditBalance || 0)
      const expectedTotal = limit + calculatedTotal
      const diffAggregation = Math.abs(expectedTotal - realTotalStored)
      let isOkAggregation = diffAggregation < 2000

      trace.push(`--- AUDIT RESULT ---`)
      if (targetDate) {
        const dayNetChange = dayRecharges + dayProfits - dayDiscounts
        const calculatedFinalBalance = initialBalanceAtStartOfDay + dayNetChange // Should match current state if no other txs exists after

        trace.push(`Day: ${targetDate}`)
        trace.push(`Initial Net Balance (5AM): ${initialBalanceAtStartOfDay}`)
        trace.push(`Day Recharges: ${dayRecharges}`)
        trace.push(`Day Profits: ${dayProfits}`)
        trace.push(`Day Discounts: ${dayDiscounts}`)
        trace.push(`Day Net Change: ${dayNetChange}`)
        trace.push(`Calculated End Net Balance: ${calculatedFinalBalance}`)

        // If we are strictly auditing a past day, this "Calculated End Net Balance"
        // doesn't necessarily match CURRENT database state if there are future transactions.
        // But it's valid for the day report.
      } else {
        trace.push(`Global Net Change (Calculated): ${calculatedTotal}`)
        trace.push(`Actual Stored (Avail + Surp): ${realTotalStored}`)
        trace.push(`Difference: ${diffAggregation}`)
        trace.push(`Status: ${isOkAggregation ? 'OK' : 'INCONSISTENT'}`)
      }

      const firstTx = transactions[0]
      const lastTx = transactions[transactions.length - 1]
      const accumulatedDebt = currentSurplus > 0 ? 0 : limit - currentAvailable

      return {
        userId: minorista.user.id,
        email: minorista.user.email,
        fullName: minorista.user.fullName,
        status: isOkAggregation ? 'OK' : 'INCONSISTENT',
        details: {
          storedAvailable: minorista.availableCredit,
          storedSurplus: minorista.creditBalance || 0,
          calculatedAvailable: currentAvailable,
          calculatedSurplus: currentSurplus,
          difference: diffAggregation,
          accumulatedDebt,
          aggregated: {
            totalRecharges,
            totalProfits,
            totalDiscounts,
            calculatedTotal,
            realTotalStored: realTotalStored,
          },
          dailyStats: targetDate
            ? {
                targetDate,
                initialBalance: initialBalanceAtStartOfDay,
                transactionsCount: dayTxCount,
                dayTotalRecharges: dayRecharges,
                dayTotalProfits: dayProfits,
                dayTotalDiscounts: dayDiscounts,
                dayNetChange: dayRecharges + dayProfits - dayDiscounts,
                finalBalance: initialBalanceAtStartOfDay + (dayRecharges + dayProfits - dayDiscounts),
              }
            : undefined,
          firstTransaction: firstTx
            ? {
                amount: firstTx.amount,
                date: firstTx.createdAt,
                type: firstTx.type,
              }
            : undefined,
          lastTransaction: lastTx
            ? {
                storedAvailable: lastTx.availableCredit,
                storedSurplus: lastTx.currentBalanceInFavor || 0,
                date: lastTx.createdAt,
                type: lastTx.type,
              }
            : undefined,
        },
        trace,
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
          accumulatedDebt: 0,
        },
        trace: [`Error: ${error}`],
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
