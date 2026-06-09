import { DI } from '@/di'
import { Giro, GiroStatus } from '@/entities/Giro'
import {
  MinoristaTransaction,
  MinoristaTransactionType,
  MinoristaTransactionStatus,
} from '@/entities/MinoristaTransaction'
import { Minorista } from '@/entities/Minorista'
import { User } from '@/entities/User'
import { EntityManager, FilterQuery, LockMode } from '@mikro-orm/core'
import { giroSocketManager } from '@/websocket'

export interface CreateTransactionInput {
  minoristaId: string
  amount: number
  type: MinoristaTransactionType
  status?: MinoristaTransactionStatus // Estado de la transacción (Default: COMPLETED)
  createdBy: User
  updateBalanceInFavor?: boolean
  description?: string
  giro?: any
}

export class MinoristaTransactionService {
  /**
   * Actualiza el estado de una transacción
   */
  async updateTransactionStatus(
    transactionId: string,
    status: MinoristaTransactionStatus,
    em?: EntityManager
  ): Promise<MinoristaTransaction | { error: 'TRANSACTION_NOT_FOUND' }> {
    const manager = em || DI.em
    const transactionRepo = manager.getRepository(MinoristaTransaction)

    const transaction = await transactionRepo.findOne({ id: transactionId }, { populate: ['minorista', 'createdBy'] })
    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    if (transaction.status === MinoristaTransactionStatus.PENDING && status === MinoristaTransactionStatus.CANCELLED) {
      // Logic for PENDING -> CANCELLED if needed
    }

    transaction.status = status
    await manager.persistAndFlush(transaction)

    if (giroSocketManager) {
      giroSocketManager.broadcastMinoristaTransactionUpdate(transaction)
    }

    return transaction
  }

  async createTransaction(
    data: CreateTransactionInput,
    em?: EntityManager
  ): Promise<MinoristaTransaction | { error: 'MINORISTA_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    // 🛡️ CRITICAL: Enforce transaction for Pessimistic Locking
    // If no EM provided, start a new transaction and recursively call this method
    if (!em) {
      return DI.em.transactional((txEm) => this.createTransaction(data, txEm))
    }

    const manager = em
    const minoristaRepo = manager.getRepository(Minorista)
    const transactionRepo = manager.getRepository(MinoristaTransaction)

    // 🔒 LOCKING: Use Pessimistic Write Lock to prevent race conditions
    // This serializes access to the minorista record, ensuring strictly sequential balance updates.
    // Must be run inside a transaction (guaranteed by the check above).
    const minorista = await minoristaRepo.findOne({ id: data.minoristaId }, { lockMode: LockMode.PESSIMISTIC_WRITE })

    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const previousAvailableCredit = minorista.availableCredit
    const previousBalanceInFavorValue = minorista.creditBalance || 0 // Capturar ANTES de actualizar
    const { creditLimit } = minorista

    let newAvailableCredit = previousAvailableCredit
    let balanceInFavorUsed = 0
    let creditUsed = 0
    let newBalanceInFavor = previousBalanceInFavorValue
    let externalDebt = 0

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case MinoristaTransactionType.RECHARGE:
        // Si updateBalanceInFavor es true, el amount va al saldo a favor, no al crédito disponible
        if (data.updateBalanceInFavor) {
          newAvailableCredit = previousAvailableCredit
          newBalanceInFavor = previousBalanceInFavorValue + data.amount
        } else {
          // Lógica estándar para RECHARGE (Abono positivo o "Pago de Deuda" negativo)
          if (data.amount < 0 && previousBalanceInFavorValue > 0) {
            // Caso especial: Hay un débito (o carga negativa) y el usuario tiene saldo a favor.
            // Primero consumimos el saldo a favor para cubrir la deuda.
            const absAmount = Math.abs(data.amount)

            if (previousBalanceInFavorValue >= absAmount) {
              // El saldo a favor cubre todo el débito
              newBalanceInFavor = previousBalanceInFavorValue - absAmount
              balanceInFavorUsed = absAmount
              newAvailableCredit = previousAvailableCredit // No se toca el crédito disponible si se cubre con el saldo
            } else {
              // El saldo a favor cubre parcialmente
              balanceInFavorUsed = previousBalanceInFavorValue
              const remainingDebt = absAmount - previousBalanceInFavorValue
              newBalanceInFavor = 0

              // El resto se descuenta del crédito disponible (generando deuda real si baja de el límite)
              newAvailableCredit = Math.min(previousAvailableCredit - remainingDebt, minorista.creditLimit)
            }
          } else {
            // Comportamiento estándar: Sumar al crédito disponible y el exceso al saldo a favor
            const limit = minorista.creditLimit
            const gap = limit - previousAvailableCredit

            if (data.amount > 0) {
              // Si es un abono positivo
              if (previousAvailableCredit < limit) {
                // Hay espacio en el cupo
                const amountToCredit = Math.min(data.amount, gap)
                newAvailableCredit = previousAvailableCredit + amountToCredit
                const remaining = data.amount - amountToCredit
                newBalanceInFavor = previousBalanceInFavorValue + remaining
              } else {
                // Cupo lleno (o desbordado), todo al saldo a favor
                newAvailableCredit = previousAvailableCredit // Mantiene el desbordamiento si ya existía? Mejor no, respetemos lo que hay.
                // Si queremos normalizar: newAvailableCredit = limit? No, mejor no tocar si ya estaba pasado.
                newBalanceInFavor = previousBalanceInFavorValue + data.amount
              }
              // Normalizar: Si newAvailableCredit > limit y tenemos deuda externa?
              // Por ahora, lógica simple: Llenar available hasta limit, resto a balance.
              // Corrección de lógica para cubrir casos borde:

              // Total fondos nuevos = Actual + Abono
              const totalFunds = previousAvailableCredit + data.amount
              if (totalFunds > limit) {
                newAvailableCredit = limit
                newBalanceInFavor = previousBalanceInFavorValue + (totalFunds - limit)
              } else {
                newAvailableCredit = totalFunds
                newBalanceInFavor = previousBalanceInFavorValue
              }
            } else {
              // Si es negativo (Pago de deuda que se resta?) No, RECHARGE negativo es raro aquí, usualmente handled above.
              // Mantener lógica simple para negativo: Resetear math min
              newAvailableCredit = Math.min(previousAvailableCredit + data.amount, limit)
              newBalanceInFavor = previousBalanceInFavorValue
            }
          }
        }
        break

      case MinoristaTransactionType.DISCOUNT: {
        // Calcular ganancia inmediatamente (5% del monto)
        const immediateProfit = data.amount * 0.05

        // Paso 1: Descontar primero del saldo a favor
        const userBalance = minorista.creditBalance || 0
        let remainingAmount = data.amount

        if (remainingAmount <= userBalance) {
          balanceInFavorUsed = remainingAmount
          newBalanceInFavor = userBalance - remainingAmount
          remainingAmount = 0
        } else {
          balanceInFavorUsed = userBalance
          remainingAmount -= userBalance
          newBalanceInFavor = 0
        }

        // Paso 2: Descontar del crédito disponible
        if (remainingAmount > 0) {
          if (remainingAmount <= previousAvailableCredit) {
            creditUsed = remainingAmount
            newAvailableCredit = previousAvailableCredit - remainingAmount
            remainingAmount = 0
          } else {
            creditUsed = previousAvailableCredit
            externalDebt = remainingAmount - previousAvailableCredit
            newAvailableCredit = 0
            remainingAmount = 0
          }
        } else {
          newAvailableCredit = previousAvailableCredit
        }

        // Paso 3: Añadir ganancia
        // Distribuir la ganancia entre crédito disponible y saldo a favor
        // Queremos llenar el crédito disponible hasta el límite, y el sobrante va a saldo a favor
        const limit = minorista.creditLimit
        const currentFunds = newAvailableCredit + immediateProfit

        if (currentFunds > limit) {
          newAvailableCredit = limit
          newBalanceInFavor += currentFunds - limit // Sumar al saldo a favor (que podría haber quedado > 0 o 0)
        } else {
          newAvailableCredit = currentFunds
        }

        // Validación: Si hay deuda externa, debe poder ser cubierta por la ganancia
        // (La ganancia ya se sumó a newAvailable o newBalance)
        if (externalDebt > 0) {
          if (externalDebt > immediateProfit) {
            return { error: 'INSUFFICIENT_BALANCE' }
          }
        }

        minorista.creditBalance = newBalanceInFavor
        break
      }

      case MinoristaTransactionType.ADJUSTMENT:
        newAvailableCredit = previousAvailableCredit + data.amount
        if (newAvailableCredit < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        newBalanceInFavor = previousBalanceInFavorValue
        break

      case MinoristaTransactionType.REFUND: {
        // Reembolso: Se devuelve el monto neto (Monto - Ganancia ya otorgada)
        const profitToRevert = data.amount * 0.05
        const netRefund = data.amount - profitToRevert

        // Calcular liquidez total: (Crédito disponible actual) + (Saldo a favor actual) + (Reembolso)
        // Nota: Si el crédito disponible ya excedía el límite (por un bug previo), esto se normalizará aquí.
        const totalFunds = previousAvailableCredit + previousBalanceInFavorValue + netRefund

        if (totalFunds > minorista.creditLimit) {
          // Llenamos el cupo hasta el límite y el resto es saldo a favor
          newAvailableCredit = minorista.creditLimit
          newBalanceInFavor = totalFunds - minorista.creditLimit
        } else {
          // Si no supera el límite, todo va al crédito disponible y no hay saldo a favor
          newAvailableCredit = totalFunds
          newBalanceInFavor = 0
        }
        break
      }
    }

    // Calcular ganancia: 5% para DISCOUNT
    let profitEarned = 0
    if (data.type === MinoristaTransactionType.DISCOUNT) {
      profitEarned = data.amount * 0.05
    }

    const creditConsumed = data.type === MinoristaTransactionType.DISCOUNT ? data.amount : 0

    //Obtener la última transacción para mantener o reiniciar el profit acumulado
    const lastTransaction = await transactionRepo.findOne({ minorista }, { orderBy: { createdAt: 'DESC' } })

    let accumulatedProfit = 0

    if (data.type === MinoristaTransactionType.RECHARGE) {
      accumulatedProfit = 0 // Reinicia en recarga
    } else if (data.type === MinoristaTransactionType.DISCOUNT) {
      accumulatedProfit = (lastTransaction?.accumulatedProfit ?? 0) + profitEarned
    } else {
      accumulatedProfit = lastTransaction?.accumulatedProfit ?? 0
    }

    // Calcular deuda real: si hay saldo a favor, no hay deuda. Si no, deuda = creditLimit - availableCredit
    const realDebt = newBalanceInFavor > 0 ? 0 : creditLimit - newAvailableCredit

    // Crear transacción
    const transaction = transactionRepo.create({
      minorista,
      amount: data.amount,
      type: data.type,
      creditConsumed,
      profitEarned,
      previousAvailableCredit,
      previousBalanceInFavor: previousBalanceInFavorValue, // Saldo a favor anterior (capturado al inicio)
      accumulatedDebt: realDebt,
      accumulatedProfit,
      availableCredit: newAvailableCredit,
      currentBalanceInFavor: newBalanceInFavor, // Saldo a favor nuevo
      balanceInFavorUsed: balanceInFavorUsed > 0 ? balanceInFavorUsed : undefined,
      creditUsed: creditUsed > 0 ? creditUsed : undefined,
      remainingBalance: newBalanceInFavor > 0 ? newBalanceInFavor : undefined,
      externalDebt: externalDebt > 0 ? externalDebt : undefined,
      status: data.status || MinoristaTransactionStatus.COMPLETED,
      createdBy: data.createdBy,
      description: data.description,
      giro: data.giro,
      createdAt: new Date(),
    })

    // Actualizar los balances del minorista
    minorista.availableCredit = newAvailableCredit
    minorista.creditBalance = newBalanceInFavor

    // Guardar en la base de datos
    // Si se pasó un EM, usamos persist (el caller hace flush/commit)
    // Si NO se pasó un EM, usamos persistAndFlush
    if (em) {
      manager.persist([transaction, minorista])
    } else {
      await manager.persistAndFlush([transaction, minorista])
    }

    // Emitir eventos de WebSocket para actualización en tiempo real
    if (giroSocketManager) {
      // 1. Actualizar balance (siempre)
      giroSocketManager.broadcastMinoristaBalanceUpdate(minorista.id, newAvailableCredit, newBalanceInFavor)

      // 2. Actualizar transacción (solo si está COMPLETADA)
      if (transaction.status === MinoristaTransactionStatus.COMPLETED) {
        giroSocketManager.broadcastMinoristaTransactionUpdate(transaction)
      }
    }

    return transaction
  }

  /**
   * Lista las transacciones de un minorista con paginación
   */
  async listTransactionsByMinorista(
    minoristaId: string,
    options?: { page?: number; limit?: number; startDate?: string; endDate?: string }
  ): Promise<
    | {
        total: number
        page: number
        limit: number
        startBalance?: number
        startBalanceInFavor?: number
        transactions: Array<{
          id: string
          amount: number
          type: MinoristaTransactionType
          previousBalance: number
          currentBalance: number
          previousBalanceInFavor: number
          currentBalanceInFavor: number
          balanceInFavorUsed?: number
          creditUsed?: number
          externalDebt?: number
          profitEarned?: number
          createdBy: {
            id: string
            fullName: string
            email: string
          }
          createdAt: Date
        }>
      }
    | { error: 'MINORISTA_NOT_FOUND' }
  > {
    const minoristaRepo = DI.em.getRepository(Minorista)
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    // Verificar que el minorista exista
    const minorista = await minoristaRepo.findOne({ id: minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    // Construir filtro con fechas si se proporcionan
    const where: FilterQuery<MinoristaTransaction> = { minorista: minoristaId }

    if (options?.startDate && options?.endDate) {
      const startDate = new Date(options.startDate)
      const endDate = new Date(options.endDate)
      // Don't modify hours - they come from frontend as ISO strings with proper times
      // (e.g., "2025-11-22T00:00:00.000Z" to "2025-11-23T23:59:59.999Z")

      where.createdAt = { $gte: startDate, $lte: endDate }
    }

    // Filter by status: ONLY COMPLETED transactions (unless overridden? For now, hardcode)
    // We want to hide PENDING (Hold) and CANCELLED transactions from the history
    where.status = MinoristaTransactionStatus.COMPLETED

    // Calculate Opening Balance (Saldo Inicial) if startDate is provided
    let startBalance = minorista.creditLimit // Default: Initial state (Full credit limit available)
    let startBalanceInFavor = 0

    if (options?.startDate) {
      const startDate = new Date(options.startDate)
      // Find the LAST transaction BEFORE the startDate
      const lastTransactionBeforeStart = await transactionRepo.findOne(
        {
          minorista: minoristaId,
          createdAt: { $lt: startDate },
          status: MinoristaTransactionStatus.COMPLETED,
        },
        {
          orderBy: { createdAt: 'DESC', id: 'DESC' },
        }
      )

      if (lastTransactionBeforeStart) {
        // The opening balance for the period is the closing balance of the previous transaction
        startBalance = lastTransactionBeforeStart.availableCredit
        startBalanceInFavor = lastTransactionBeforeStart.currentBalanceInFavor ?? 0
      }
    }

    const [transactions, total] = await transactionRepo.findAndCount(where, {
      limit,
      offset,
      populate: ['createdBy'],
      orderBy: { createdAt: 'DESC', id: 'DESC' }, // Más recientes primero, deterministic tie-breaker
    })

    const data = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      previousBalance: t.previousAvailableCredit,
      currentBalance: t.availableCredit,
      previousBalanceInFavor: t.previousBalanceInFavor ?? 0,
      currentBalanceInFavor: t.currentBalanceInFavor ?? 0,
      balanceInFavorUsed: t.balanceInFavorUsed,
      creditUsed: t.creditUsed,
      externalDebt: t.externalDebt,
      profitEarned: t.profitEarned,
      createdBy: {
        id: t.createdBy.id,
        fullName: t.createdBy.fullName,
        email: t.createdBy.email,
      },
      createdAt: t.createdAt,
    }))

    return {
      total,
      page,
      limit,
      transactions: data,
      startBalance,
      startBalanceInFavor,
    }
  }

  /**
   * Obtiene una transacción por ID
   */
  async getTransactionById(transactionId: string): Promise<
    | {
        id: string
        amount: number
        type: MinoristaTransactionType
        previousBalance: number
        currentBalance: number
        minorista: {
          id: string
          availableCredit: number
          user: {
            id: string
            fullName: string
            email: string
          }
        }
        createdBy: {
          id: string
          fullName: string
          email: string
        }
        createdAt: Date
      }
    | { error: 'TRANSACTION_NOT_FOUND' }
  > {
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    const transaction = await transactionRepo.findOne(
      { id: transactionId },
      { populate: ['minorista', 'minorista.user', 'createdBy'] }
    )

    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    return {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      previousBalance: transaction.previousAvailableCredit,
      currentBalance: transaction.availableCredit,
      minorista: {
        id: transaction.minorista.id,
        availableCredit: transaction.availableCredit,
        user: {
          id: transaction.minorista.user.id,
          fullName: transaction.minorista.user.fullName,
          email: transaction.minorista.user.email,
        },
      },
      createdBy: {
        id: transaction.createdBy.id,
        fullName: transaction.createdBy.fullName,
        email: transaction.createdBy.email,
      },
      createdAt: transaction.createdAt,
    }
  }
  /**
   * Obtiene todas las transacciones para exportación (sin paginación)
   */
  async getTransactionsForExport(
    minoristaId: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<MinoristaTransaction[] | { error: 'MINORISTA_NOT_FOUND' }> {
    const minoristaRepo = DI.em.getRepository(Minorista)
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    const minorista = await minoristaRepo.findOne({ id: minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const where: FilterQuery<MinoristaTransaction> = {
      minorista: minoristaId,
      status: MinoristaTransactionStatus.COMPLETED,
    }

    if (options?.startDate && options?.endDate) {
      const startDate = new Date(options.startDate)
      const endDate = new Date(options.endDate)
      console.log(`[Export] Filtering by date: Start=${startDate.toISOString()}, End=${endDate.toISOString()}`)
      where.createdAt = { $gte: startDate, $lte: endDate }
    } else {
      console.log(`[Export] No date filter provided (Full History)`)
    }

    // Fetch ALL matching transactions ordered by date
    const transactions = await transactionRepo.find(where, {
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      populate: ['createdBy', 'giro'],
    })

    console.log(`[Export] Found ${transactions.length} transactions for minorista ${minoristaId}`)

    return transactions
  }
  /**
   * Obtiene datos combinados de Giros (directamente de tabla giros) y Recargas (tabla transacciones)
   */
  async getCombinedExportData(minoristaId: string, options?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const giroRepo = DI.em.getRepository(Giro)
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    // Filtros de fecha base
    const dateFilter: any = {}
    if (options?.startDate && options?.endDate) {
      dateFilter.$gte = new Date(options.startDate)
      dateFilter.$lte = new Date(options.endDate)
    }

    // 1. Fetch COMPLETED Giros
    const giroQuery: any = {
      minorista: minoristaId,
      status: GiroStatus.COMPLETADO,
    }
    if (dateFilter.$gte) {
      giroQuery.createdAt = dateFilter
    }

    const giros = await giroRepo.find(giroQuery, {
      orderBy: { createdAt: 'DESC' },
    })

    // 2. Fetch RECHARGE Transactions
    const txQuery: any = {
      minorista: minoristaId,
      type: MinoristaTransactionType.RECHARGE,
    }
    if (dateFilter.$gte) {
      txQuery.createdAt = dateFilter
    }

    const recharges = await transactionRepo.find(txQuery, {
      orderBy: { createdAt: 'DESC' },
    })

    // 3. Map both to common structure
    const mappedGiros = giros.map((g) => ({
      date: g.createdAt,
      type: 'GIRO',
      description: `Giro a ${g.beneficiaryName}`,
      amountCOP: g.amountInput, // Monto Original en COP
      amountBs: g.amountBs, // Monto en Bs
      profit: g.minoristaProfit, // Ganancia del minorista
      isRecharge: false,
    }))

    const mappedRecharges = recharges.map((t) => ({
      date: t.createdAt,
      type: 'ABONO',
      description: t.description || 'Recarga de Saldo',
      amountCOP: t.amount, // Monto Recarga
      amountBs: 0,
      profit: 0,
      isRecharge: true,
    }))

    // 4. Merge and Sort
    const combined = [...mappedGiros, ...mappedRecharges].sort((a, b) => {
      return b.date.getTime() - a.date.getTime() // Descending
    })

    return combined
  }
}

export const minoristaTransactionService = new MinoristaTransactionService()
