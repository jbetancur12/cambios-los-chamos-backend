import { DI } from '@/di'
import { BankAccount, AccountType } from '@/entities/BankAccount'
import { Transferencista } from '@/entities/Transferencista'
import { Bank } from '@/entities/Bank'

export interface CreateBankAccountInput {
  transferencistaId?: string // Opcional: solo si admin/superadmin crea cuenta para otro transferencista
  bankId: string
  accountNumber: string
  accountHolder: string
  accountType?: AccountType
}

export class BankAccountService {
  /**
   * Crea una cuenta bancaria para un transferencista
   * - Si transferencista crea su propia cuenta: usa su ID
   * - Si admin/superadmin crea cuenta: requiere transferenciaId
   */
  async createBankAccount(
    data: CreateBankAccountInput
  ): Promise<BankAccount | { error: 'TRANSFERENCISTA_NOT_FOUND' | 'BANK_NOT_FOUND' | 'ACCOUNT_NUMBER_EXISTS' }> {
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const transferencistaRepo = DI.em.getRepository(Transferencista)
    const bankRepo = DI.em.getRepository(Bank)

    let transferencista: Transferencista | null = null

    // Validar Transferencista
    transferencista = await transferencistaRepo.findOne({ id: data.transferencistaId })
    if (!transferencista) throw new Error('Transferencista no encontrado')

    // Validar Banco
    const bank = await bankRepo.findOne({ id: data.bankId })
    if (!bank) throw new Error('Banco no encontrado')

    // Validar número de cuenta único
    const existing = await bankAccountRepo.findOne({ accountNumber: data.accountNumber })
    if (existing) throw new Error('Número de cuenta ya registrado')

    // Crear cuenta
    const bankAccount = bankAccountRepo.create({
      transferencista,
      bank,
      accountNumber: data.accountNumber,
      accountHolder: data.accountHolder,
      accountType: data.accountType ?? AccountType.AHORROS,
      balance: 0,
    })

    await DI.em.persistAndFlush(bankAccount)

    return bankAccount
  }

  /**
   * Obtiene todas las cuentas bancarias de un transferencista
   */
  async getBankAccountsByTransferencista(
    transferenciaId: string
  ): Promise<BankAccount[] | { error: 'TRANSFERENCISTA_NOT_FOUND' }> {
    const transferencistaRepo = DI.em.getRepository(Transferencista)
    const bankAccountRepo = DI.em.getRepository(BankAccount)

    const transferencista = await transferencistaRepo.findOne({ id: transferenciaId })
    if (!transferencista) {
      return { error: 'TRANSFERENCISTA_NOT_FOUND' }
    }

    const accounts = await bankAccountRepo.find({ transferencista: transferenciaId }, { populate: ['bank'] })

    return accounts
  }

  /**
   * Actualiza el balance de una cuenta bancaria
   */
  async updateBalance(bankAccountId: string, amount: number): Promise<BankAccount> {
    const bankAccountRepo = DI.em.getRepository(BankAccount)

    const account = await bankAccountRepo.findOne({ id: bankAccountId })
    if (!account) throw new Error('Cuenta bancaria no encontrada')

    account.balance += amount
    await DI.em.persistAndFlush(account)

    return account
  }

  /**
   * Obtiene una cuenta bancaria por ID
   */
  async listByTransferencista(transferencistaId: string) {
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const transferencistaRepo = DI.em.getRepository(Transferencista)

    const transferencista = await transferencistaRepo.findOne({ id: transferencistaId })
    if (!transferencista) throw new Error('Transferencista no encontrado')

    const accounts = await bankAccountRepo.find(
      { transferencista },
      { populate: ['bank'] } // traer info del banco
    )

    // Retornar solo info relevante
    return accounts.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      accountHolder: a.accountHolder,
      accountType: a.accountType,
      balance: a.balance,
      bank: {
        id: a.bank.id,
        name: a.bank.name,
        code: a.bank.code,
      },
    }))
  }
}

export const bankAccountService = new BankAccountService()
