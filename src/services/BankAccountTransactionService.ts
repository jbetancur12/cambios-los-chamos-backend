import { DI } from '@/di'
import { BankAccountTransaction, BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { BankAccount } from '@/entities/BankAccount'
import { User } from '@/entities/User'

export interface CreateBankAccountTransactionInput {
  bankAccountId: string
  amount: number
  type: BankAccountTransactionType
  reference?: string
  createdBy: User
}

export class BankAccountTransactionService {
  /**
   * Crea una transacción de cuenta bancaria y actualiza el balance
   * Esta función maneja la lógica de negocio completa:
   * 1. Verifica que la cuenta exista
   * 2. Calcula el nuevo balance según el tipo de transacción
   * 3. Crea el registro de transacción con balance anterior y nuevo
   * 4. Actualiza el balance de la cuenta
   */
  async createTransaction(
    data: CreateBankAccountTransactionInput
  ): Promise<BankAccountTransaction | { error: 'BANK_ACCOUNT_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const transactionRepo = DI.em.getRepository(BankAccountTransaction)

    // Buscar cuenta bancaria
    const bankAccount = await bankAccountRepo.findOne({ id: data.bankAccountId })
    if (!bankAccount) {
      return { error: 'BANK_ACCOUNT_NOT_FOUND' }
    }

    const previousBalance = bankAccount.balance
    let newBalance = previousBalance

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case BankAccountTransactionType.DEPOSIT:
        // Depósito: sumar al balance
        newBalance = previousBalance + data.amount
        break
      case BankAccountTransactionType.WITHDRAWAL:
        // Retiro: restar del balance (validar que no quede negativo)
        newBalance = previousBalance - data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
      case BankAccountTransactionType.ADJUSTMENT:
        // Ajuste: puede ser positivo o negativo
        newBalance = previousBalance + data.amount
        if (newBalance < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        break
    }

    // Crear transacción
    const transaction = transactionRepo.create({
      bankAccount,
      amount: data.amount,
      type: data.type,
      reference: data.reference,
      previousBalance,
      currentBalance: newBalance,
      createdBy: data.createdBy,
    })

    // Actualizar balance de la cuenta
    bankAccount.balance = newBalance

    // Guardar todo en transacción atómica
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush([transaction, bankAccount])
    })

    return transaction
  }

  /**
   * Lista las transacciones de una cuenta bancaria con paginación
   */
  async listTransactionsByBankAccount(
    bankAccountId: string,
    options?: { page?: number; limit?: number }
  ): Promise<
    | {
        total: number
        page: number
        limit: number
        transactions: Array<{
          id: string
          amount: number
          type: BankAccountTransactionType
          reference?: string
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
    | { error: 'BANK_ACCOUNT_NOT_FOUND' }
  > {
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const transactionRepo = DI.em.getRepository(BankAccountTransaction)

    // Verificar que la cuenta exista
    const bankAccount = await bankAccountRepo.findOne({ id: bankAccountId })
    if (!bankAccount) {
      return { error: 'BANK_ACCOUNT_NOT_FOUND' }
    }

    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    const [transactions, total] = await transactionRepo.findAndCount(
      { bankAccount: bankAccountId },
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
      reference: t.reference,
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
        type: BankAccountTransactionType
        reference?: string
        previousBalance: number
        currentBalance: number
        bankAccount: {
          id: string
          accountNumber: string
          accountHolder: string
          balance: number
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
    const transactionRepo = DI.em.getRepository(BankAccountTransaction)

    const transaction = await transactionRepo.findOne({ id: transactionId }, { populate: ['bankAccount', 'createdBy'] })

    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    return {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      reference: transaction.reference,
      previousBalance: transaction.previousBalance,
      currentBalance: transaction.currentBalance,
      bankAccount: {
        id: transaction.bankAccount.id,
        accountNumber: transaction.bankAccount.accountNumber,
        accountHolder: transaction.bankAccount.accountHolder,
        balance: transaction.bankAccount.balance,
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

export const bankAccountTransactionService = new BankAccountTransactionService()
