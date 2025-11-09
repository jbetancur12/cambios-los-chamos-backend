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

    const previousBalance = minorista.balance
    let newBalance = previousBalance

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case MinoristaTransactionType.RECHARGE:
        // Recarga: sumar al balance
        newBalance = previousBalance + data.amount
        break
      case MinoristaTransactionType.DISCOUNT:
        // Descuento: restar del balance (validar que no quede negativo)
        newBalance = previousBalance - data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
      case MinoristaTransactionType.ADJUSTMENT:
        // Ajuste: puede ser positivo o negativo
        newBalance = previousBalance + data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
    }

    // Crear transacción
    const transaction = transactionRepo.create({
      minorista,
      amount: data.amount,
      type: data.type,
      previousBalance,
      currentBalance: newBalance,
      createdBy: data.createdBy,
      createdAt: new Date(),
    })

    // Actualizar balance del minorista
    minorista.balance = newBalance

    // Guardar todo en transacción atómica
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
    options?: { page?: number; limit?: number }
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

    const [transactions, total] = await transactionRepo.findAndCount(
      { minorista: minoristaId },
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
      previousBalance: t.previousBalance,
      currentBalance: t.currentBalance,
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
          balance: number
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
      previousBalance: transaction.previousBalance,
      currentBalance: transaction.currentBalance,
      minorista: {
        id: transaction.minorista.id,
        balance: transaction.minorista.balance,
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
