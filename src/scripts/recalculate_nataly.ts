import { initDI, DI } from '@/di'
import { User } from '@/entities/User'
import {
  MinoristaTransaction,
  MinoristaTransactionType,
  MinoristaTransactionStatus,
} from '@/entities/MinoristaTransaction'

async function recalculateNataly() {
  await initDI()
  const em = DI.orm.em.fork()

  try {
    const user = await em.findOne(User, { email: 'nathalypea@gmail.com' }, { populate: ['minorista'] })
    if (!user || !user.minorista) {
      console.log('Minorista not found')
      return
    }

    const minorista = user.minorista
    const limit = minorista.creditLimit

    // 1. Delete the ADJUSTMENT transaction we just made (if it exists, latest one)
    const latestAdj = await em.findOne(
      MinoristaTransaction,
      {
        minorista: minorista.id,
        type: MinoristaTransactionType.ADJUSTMENT,
        amount: -200000,
      },
      { orderBy: { createdAt: 'DESC' } }
    )

    if (latestAdj) {
      console.log(`Deleting temporary adjustment transaction ${latestAdj.id}...`)
      em.remove(latestAdj)
      await em.flush() // flush delete first
    }

    // 2. Fetch all transactions ASC
    const transactions = await em.find(
      MinoristaTransaction,
      { minorista: minorista.id, status: { $ne: MinoristaTransactionStatus.CANCELLED } }, // Exclude cancelled? Yes.
      { orderBy: { createdAt: 'ASC' } }
    )

    console.log(`Found ${transactions.length} transactions. Recalculating...`)

    // Initial State
    // Asumimos que empezó con el crédito completo y sin deuda.
    // OJO: Si tiene historias muy antiguas, esto podría alterar todo el pasado.
    // Pero el usuario pidió "recalculate".
    let currentAvailable = limit
    let currentSurplus = 0

    for (const t of transactions) {
      // Set previous
      t.previousAvailableCredit = currentAvailable
      t.previousBalanceInFavor = currentSurplus

      // Apply Logic
      // NOTA: Simplificado para seguir la matemática de 'funds'.
      // createTransaction usa lógica compleja de "fill bucket". Trataremos de emularla.

      const amount = t.amount
      const profit = t.profitEarned || 0

      if (t.type === MinoristaTransactionType.RECHARGE) {
        // Recharge: Add amount to funds
        // Logic: Fill available up to limit, rest to surplus.
        // But check if amount < 0 (debt payment logic?)
        // Usually RECHARGE is > 0.
        if (amount >= 0) {
          const totalFunds = currentAvailable + amount
          if (totalFunds > limit) {
            currentAvailable = limit
            currentSurplus = currentSurplus + (totalFunds - limit) // Add to existing surplus?
            // Wait. Logic in service:
            // newBalanceInFavor = previousBalanceInFavorValue + (totalFunds - limit)
            // Yes.
            // But wait, "totalFunds" in service was "previousAvailable + amount".
            // It didn't include previousSurplus in the "fill bucket" logic for *Available*.
            // Correct. Surplus is separate.
            // But if I have surplus, effectively my available credit IS limit.
          } else {
            currentAvailable = totalFunds
            // Surplus unchanged? Service: "newBalanceInFavor = previousBalanceInFavorValue"
          }
        } else {
          // Negative recharge (correction?)
          // Logic: subtract.
          // Service: "newAvailableCredit = Math.min(previousAvailableCredit + data.amount, limit)"
          currentAvailable = Math.min(currentAvailable + amount, limit)
        }
      } else if (t.type === MinoristaTransactionType.DISCOUNT) {
        // Discount: Subtract amount. Add Profit.
        // 1. Profit is earned immediately. Use 'profit' var.
        // 2. Consume from Surplus first, then Available.

        let amountToDeduct = amount

        // Deduct from Surplus
        if (currentSurplus >= amountToDeduct) {
          currentSurplus -= amountToDeduct
          amountToDeduct = 0
        } else {
          amountToDeduct -= currentSurplus
          currentSurplus = 0
        }

        // Deduct from Available
        if (amountToDeduct > 0) {
          currentAvailable -= amountToDeduct
        }

        // 3. Add Profit (distribute to Available/Surplus)
        const fundsAfterProfit = currentAvailable + profit
        if (fundsAfterProfit > limit) {
          currentAvailable = limit
          currentSurplus += fundsAfterProfit - limit
        } else {
          currentAvailable = fundsAfterProfit
        }
      } else if (t.type === MinoristaTransactionType.REFUND) {
        // Refund: Add (Amount - ProfitReverted)
        // The 'amount' in DB is likely the full amount.
        // Check service: "netRefund = data.amount - profitToRevert"
        // "totalFunds = previousAvailableCredit + previousBalanceInFavorValue + netRefund"
        // Service logic flattens everything into totalFunds then redistributes.

        // We need to know the profit to revert. usually 5%.
        // BUT, `t.profitEarned` on a REFUND transaction might store the *negative* profit?
        // Or is it 0?
        // Service: "profitEarned = 0" for Refund type.
        // So we calculate 5% manually.
        const profitToRevert = amount * 0.05
        const netRefund = amount - profitToRevert

        // Redistribute Total Logic (Reset-style)
        const totalLiquidity = currentAvailable + currentSurplus + netRefund
        if (totalLiquidity > limit) {
          currentAvailable = limit
          currentSurplus = totalLiquidity - limit
        } else {
          currentAvailable = totalLiquidity
          currentSurplus = 0
        }
      } else if (t.type === MinoristaTransactionType.ADJUSTMENT) {
        // Adjustment: Direct add/sub to available?
        // Service: "newAvailableCredit = previousAvailableCredit + data.amount"
        currentAvailable += amount
        // no touching surplus? Service: "newBalanceInFavor = previousBalanceInFavorValue"
      }

      // Set current
      t.availableCredit = currentAvailable
      t.currentBalanceInFavor = currentSurplus

      // Calculate Accumulated Debt (Just for display)
      // realDebt = newBalanceInFavor > 0 ? 0 : creditLimit - newAvailableCredit
      t.accumulatedDebt = currentSurplus > 0 ? 0 : limit - currentAvailable

      console.log(`TK ${t.id.substring(0, 4)} | ${t.type} ${amount} | NewAvail: ${currentAvailable}`)
    }

    // Update Minorista
    minorista.availableCredit = currentAvailable
    minorista.creditBalance = currentSurplus

    console.log(`Final calculated: Available=${currentAvailable}, Surplus=${currentSurplus}`)

    await em.flush()
    console.log('Recalculation complete saved.')
  } catch (error) {
    console.error(error)
  } finally {
    await DI.orm.close()
  }
}

recalculateNataly()
