import { DI } from '@/di'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { Minorista } from '@/entities/Minorista'
import { User } from '@/entities/User'

export interface CreateTransactionInput {
  minoristaId: string
  amount: number
  type: MinoristaTransactionType
  createdBy: User
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
    data: CreateTransactionInput
  ): Promise<MinoristaTransaction | { error: 'MINORISTA_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    const minoristaRepo = DI.em.getRepository(Minorista)
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    // Buscar minorista
    const minorista = await minoristaRepo.findOne({ id: data.minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const previousAvailableCredit = minorista.availableCredit
    const { creditLimit } = minorista

    let newAvailableCredit = previousAvailableCredit

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case MinoristaTransactionType.RECHARGE:
        newAvailableCredit = Math.min(previousAvailableCredit + data.amount, minorista.creditLimit)
        break

      case MinoristaTransactionType.DISCOUNT:
        if (previousAvailableCredit < data.amount) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        newAvailableCredit = previousAvailableCredit - data.amount
        break

      case MinoristaTransactionType.PROFIT:
        newAvailableCredit = Math.min(previousAvailableCredit + data.amount, minorista.creditLimit)
        break

      case MinoristaTransactionType.ADJUSTMENT:
        newAvailableCredit = previousAvailableCredit + data.amount
        if (newAvailableCredit < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
    }

    const profitEarned = data.type === MinoristaTransactionType.PROFIT ? data.amount : 0
    const creditConsumed = data.type === MinoristaTransactionType.DISCOUNT ? data.amount : 0

    //Obtener la última transacción para mantener o reiniciar el profit acumulado
    const lastTransaction = await transactionRepo.findOne({ minorista }, { orderBy: { createdAt: 'DESC' } })

    let accumulatedProfit = 0

    if (data.type === MinoristaTransactionType.RECHARGE) {
      accumulatedProfit = 0 // Reinicia en recarga
    } else if (data.type === MinoristaTransactionType.PROFIT) {
      accumulatedProfit = (lastTransaction?.accumulatedProfit ?? 0) + data.amount
    } else {
      accumulatedProfit = lastTransaction?.accumulatedProfit ?? 0
    }

    // Crear transacción
    const transaction = transactionRepo.create({
      minorista,
      amount: data.amount,
      type: data.type,
      creditConsumed,
      profitEarned,
      previousAvailableCredit,
      accumulatedDebt: creditLimit - newAvailableCredit,
      accumulatedProfit,
      availableCredit: newAvailableCredit,
      createdBy: data.createdBy,
      createdAt: new Date(),
    })

    // Actualizar el crédito disponible del minorista
    minorista.availableCredit = newAvailableCredit

    // Guardar en una transacción atómica
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush([transaction, minorista])
    })

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
      endDate.setHours(23, 59, 59, 999)

      where.createdAt = { $gte: startDate, $lte: endDate }
    }

    const [transactions, total] = await transactionRepo.findAndCount(
      where,
      {
        limit,
        offset,
        populate: ['createdBy'],
        orderBy: { createdAt: 'DESC' }, // Más recientes primero
      }
    )

    const data = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      previousBalance: t.previousAvailableCredit,
      currentBalance: t.availableCredit,
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
