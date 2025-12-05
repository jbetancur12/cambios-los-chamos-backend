import { DI } from '@/di'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { Minorista } from '@/entities/Minorista'
import { User } from '@/entities/User'
import { EntityManager } from '@mikro-orm/core'

export interface CreateTransactionInput {
  minoristaId: string
  amount: number
  type: MinoristaTransactionType
  createdBy: User
  updateBalanceInFavor?: boolean // Si true, el amount va a creditBalance, no a availableCredit
}

export class MinoristaTransactionService {
  /**
   * Crea una transacción y actualiza el balance del minorista
   * Esta función maneja la lógica de negocio completa:
   * 1. Verifica que el minorista exista
   * 2. Calcula el nuevo balance según el tipo de transacción
   * 3. Crea el registro de transacción con balance anterior y nuevo
   * 4. Actualiza el balance del minorista
   */
  async createTransaction(
    data: CreateTransactionInput,
    em?: EntityManager
  ): Promise<MinoristaTransaction | { error: 'MINORISTA_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    const manager = em || DI.em
    const minoristaRepo = manager.getRepository(Minorista)
    const transactionRepo = manager.getRepository(MinoristaTransaction)

    // Buscar minorista
    const minorista = await minoristaRepo.findOne({ id: data.minoristaId })
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
          newAvailableCredit = Math.min(previousAvailableCredit + data.amount, minorista.creditLimit)
          newBalanceInFavor = previousBalanceInFavorValue
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

        // Paso 3: Añadir ganancia al crédito disponible (después de aplicar el descuento)
        // La ganancia se suma siempre al crédito disponible
        newAvailableCredit += immediateProfit

        // Validación: Si hay deuda externa, debe poder ser cubierta por la ganancia
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
      createdBy: data.createdBy,
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
        transactions: Array<{
          id: string
          amount: number
          type: MinoristaTransactionType
          previousBalance: number
          currentBalance: number
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
    const where: Record<string, any> = { minorista: minoristaId }

    if (options?.startDate && options?.endDate) {
      const startDate = new Date(options.startDate)
      const endDate = new Date(options.endDate)
      // Don't modify hours - they come from frontend as ISO strings with proper times
      // (e.g., "2025-11-22T00:00:00.000Z" to "2025-11-23T23:59:59.999Z")

      where.createdAt = { $gte: startDate, $lte: endDate }
    }

    const [transactions, total] = await transactionRepo.findAndCount(where, {
      limit,
      offset,
      populate: ['createdBy'],
      orderBy: { createdAt: 'DESC' }, // Más recientes primero
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
}

export const minoristaTransactionService = new MinoristaTransactionService()
