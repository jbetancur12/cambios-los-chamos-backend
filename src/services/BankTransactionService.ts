import { DI } from '@/di'
import { BankTransaction, BankTransactionType } from '@/entities/BankTransaction'
import { Bank } from '@/entities/Bank'
import { User } from '@/entities/User'

export interface CreateBankTransactionInput {
  bankId: string
  amount: number
  type: BankTransactionType
  commission?: number
  createdBy: User
}

export class BankTransactionService {
  /**
   * Crea una transacción bancaria y actualiza el balance del banco
   * Esta función maneja la lógica de negocio completa:
   * 1. Verifica que el banco exista
   * 2. Calcula el nuevo balance según el tipo de transacción
   * 3. Crea el registro de transacción con balance anterior y nuevo
   * 4. Actualiza el balance del banco
   */
  async createTransaction(
    data: CreateBankTransactionInput
  ): Promise<BankTransaction | { error: 'BANK_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    const bankRepo = DI.em.getRepository(Bank)
    const transactionRepo = DI.em.getRepository(BankTransaction)

    // Buscar banco
    const bank = await bankRepo.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    const previousBalance = bank.currentBalance
    let newBalance = previousBalance

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case BankTransactionType.RECHARGE:
        // Recarga: sumar al balance
        newBalance = previousBalance + data.amount
        break
      case BankTransactionType.TRANSFER:
        // Transferencia: restar del balance (validar que no quede negativo)
        newBalance = previousBalance - data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
      case BankTransactionType.ADJUSTMENT:
        // Ajuste: puede ser positivo o negativo
        newBalance = previousBalance + data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
    }

    // Crear transacción
    const transaction = transactionRepo.create({
      bank,
      amount: data.amount,
      type: data.type,
      commission: data.commission,
      previousBalance,
      currentBalance: newBalance,
      createdBy: data.createdBy,
    })

    // Actualizar balance del banco
    bank.currentBalance = newBalance

    // Guardar todo en transacción atómica
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush([transaction, bank])
    })

    return transaction
  }

  /**
   * Lista las transacciones de un banco con paginación
   */
  async listTransactionsByBank(
    bankId: string,
    options?: { page?: number; limit?: number }
  ): Promise<
    | {
        total: number
        page: number
        limit: number
        transactions: Array<{
          id: string
          amount: number
          type: BankTransactionType
          commission?: number
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
    | { error: 'BANK_NOT_FOUND' }
  > {
    const bankRepo = DI.em.getRepository(Bank)
    const transactionRepo = DI.em.getRepository(BankTransaction)

    // Verificar que el banco exista
    const bank = await bankRepo.findOne({ id: bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    const [transactions, total] = await transactionRepo.findAndCount(
      { bank: bankId },
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
      commission: t.commission,
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
        type: BankTransactionType
        commission?: number
        previousBalance: number
        currentBalance: number
        bank: {
          id: string
          name: string
          code: number
          currentBalance: number
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
    const transactionRepo = DI.em.getRepository(BankTransaction)

    const transaction = await transactionRepo.findOne({ id: transactionId }, { populate: ['bank', 'createdBy'] })

    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    return {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      commission: transaction.commission,
      previousBalance: transaction.previousBalance,
      currentBalance: transaction.currentBalance,
      bank: {
        id: transaction.bank.id,
        name: transaction.bank.name,
        code: transaction.bank.code,
        currentBalance: transaction.bank.currentBalance,
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

export const bankTransactionService = new BankTransactionService()
