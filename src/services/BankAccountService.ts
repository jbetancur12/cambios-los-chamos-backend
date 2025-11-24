import { DI } from '@/di'
import { BankAccount, AccountType, BankAccountOwnerType } from '@/entities/BankAccount'
import { Transferencista } from '@/entities/Transferencista'
import { Bank } from '@/entities/Bank'
import { User } from '@/entities/User'
import { canAccessBankAccount } from '@/lib/bankAccountPermissions'
import { v4 as uuidv4 } from 'uuid'

export interface CreateBankAccountInput {
  bankId: string
  accountNumber: string
  accountHolder: string
  accountType?: AccountType
  // Nuevo: tipo de propietario
  ownerType: BankAccountOwnerType
  // Nuevo: ID del propietario (requerido si ownerType='TRANSFERENCISTA')
  ownerId?: string
}

export class BankAccountService {
  /**
   * Crea una cuenta bancaria
   * - Para TRANSFERENCISTA: requiere ownerId = transferencista.id
   * - Para ADMIN: ownerId es null (cuenta compartida)
   */
async createBankAccount(
    data: CreateBankAccountInput
  ): Promise<
    | BankAccount
    | { error: 'TRANSFERENCISTA_NOT_FOUND' | 'BANK_NOT_FOUND' | 'ACCOUNT_NUMBER_EXISTS' | 'OWNER_ID_REQUIRED_FOR_TRANSFERENCISTA' }
  > {
    const bankAccountRepo = DI.em.getRepository(BankAccount)
    const transferencistaRepo = DI.em.getRepository(Transferencista)
    const bankRepo = DI.em.getRepository(Bank)

    const bank = await bankRepo.findOne({ id: data.bankId })
    console.log("🚀 ~ BankAccountService ~ createBankAccount ~ bank:", bank)
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    const existingCount = await bankAccountRepo.count({ accountNumber: data.accountNumber })
    if (existingCount > 0) {
      return { error: 'ACCOUNT_NUMBER_EXISTS' }
    }

    let transferencista: Transferencista | null = null
    
    if (data.ownerType === BankAccountOwnerType.TRANSFERENCISTA) {
      if (!data.ownerId) {
        return { error: 'OWNER_ID_REQUIRED_FOR_TRANSFERENCISTA' }
      }
      
      transferencista = await transferencistaRepo.findOne({ id: data.ownerId })
      if (!transferencista) {
        return { error: 'TRANSFERENCISTA_NOT_FOUND' }
      }
    }

    // Crear la entidad usando em.create()
    const newBankAccount = DI.em.create(BankAccount, {
      bank: bank,
      accountNumber: data.accountNumber,
      accountHolder: data.accountHolder,
      accountType: data.accountType ?? AccountType.AHORROS,
      balance: 0,
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    // Asignar transferencista solo si existe
    if (transferencista) {
      newBankAccount.transferencista = transferencista
    }

    try {
      await DI.em.persistAndFlush(newBankAccount)
      await DI.em.populate(newBankAccount, ['bank', 'transferencista'])

      return newBankAccount
    } catch (e) {
      console.error('Error detallado al crear cuenta:', e)
      throw e
    }
  }

  /**
   * Obtiene todas las cuentas bancarias accesibles para un usuario
   */
  async getBankAccountsForUser(user: User): Promise<BankAccount[]> {
    const bankAccountRepo = DI.em.getRepository(BankAccount)

    // Admin/SuperAdmin ven todas las cuentas
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return await bankAccountRepo.find({}, { populate: ['bank', 'transferencista'] })
    }

    // Transferencista solo ve sus cuentas
    if (user.role === 'TRANSFERENCISTA') {
      const transferencista = await DI.em.getRepository(Transferencista).findOne({ user: user.id })
      if (!transferencista) {
        return []
      }

      return await bankAccountRepo.find(
        {
          ownerType: BankAccountOwnerType.TRANSFERENCISTA,
          ownerId: transferencista.id,
        },
        { populate: ['bank'] }
      )
    }

    return []
  }

  /**
   * Obtiene cuentas bancarias de acuerdo al rol del usuario con validación de permisos
   */
  async getBankAccountsByUser(user: User): Promise<BankAccount[]> {
    const accounts = await this.getBankAccountsForUser(user)
    // Filtrar solo cuentas accesibles
    return accounts.filter((account) => canAccessBankAccount(account, user))
  }

  /**
   * Obtiene todas las cuentas bancarias de un transferencista (para compatibilidad)
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

    const accounts = await bankAccountRepo.find(
      {
        ownerType: BankAccountOwnerType.TRANSFERENCISTA,
        ownerId: transferenciaId,
      },
      { populate: ['bank'] }
    )

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
      {
        ownerType: BankAccountOwnerType.TRANSFERENCISTA,
        ownerId: transferencistaId,
      },
      { populate: ['bank'] }
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
