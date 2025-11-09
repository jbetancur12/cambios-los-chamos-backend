import { DI } from '@/di'
import { BankTransaction, BankTransactionType } from '@/entities/BankTransaction'
import { Bank } from '@/entities/Bank'
import { User } from '@/entities/User'

export interface CreateBankTransactionInput {
  bankId: string
  amount: number
  type: BankTransactionType
  description?: string
  reference?: string
  createdBy: User
}

/**
 * BankTransactionService - Solo para tracking administrativo
 * NO modifica ningún balance. Solo registra eventos relacionados con bancos.
 */
export class BankTransactionService {
  /**
   * Crea un registro de transacción bancaria para tracking administrativo
   * NO actualiza ningún balance, solo crea el registro
   */
  async createTransaction(data: CreateBankTransactionInput): Promise<BankTransaction | { error: 'BANK_NOT_FOUND' }> {
    const bankRepo = DI.em.getRepository(Bank)
    const transactionRepo = DI.em.getRepository(BankTransaction)

    // Verificar que el banco exista
    const bank = await bankRepo.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    // Crear registro de transacción (solo tracking, sin modificar balance)
    const transaction = transactionRepo.create({
      bank,
      amount: data.amount,
      type: data.type,
      description: data.description,
      reference: data.reference,
      createdBy: data.createdBy,
      createdAt: new Date(),
    })

    await DI.em.persistAndFlush(transaction)

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
          description?: string
          reference?: string
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
      description: t.description,
      reference: t.reference,
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
        description?: string
        reference?: string
        bank: {
          id: string
          name: string
          code: number
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
      description: transaction.description,
      reference: transaction.reference,
      bank: {
        id: transaction.bank.id,
        name: transaction.bank.name,
        code: transaction.bank.code,
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
