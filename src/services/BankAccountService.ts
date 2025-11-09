import { DI } from '@/di'
import { BankAccount, AccountType } from '@/entities/BankAccount'
import { Transferencista } from '@/entities/Transferencista'
import { Bank } from '@/entities/Bank'
import { User, UserRole } from '@/entities/User'

export interface CreateBankAccountInput {
    transferenciaId?: string  // Opcional: solo si admin/superadmin crea cuenta para otro transferencista
    bankId: string
    accountNumber: string
    accountHolder: string
    accountType?: AccountType
    balance?: number
}

export class BankAccountService {
    /**
     * Crea una cuenta bancaria para un transferencista
     * - Si transferencista crea su propia cuenta: usa su ID
     * - Si admin/superadmin crea cuenta: requiere transferenciaId
     */
    async createBankAccount(
        data: CreateBankAccountInput,
        createdBy: User
    ): Promise<BankAccount | { error: 'TRANSFERENCISTA_NOT_FOUND' | 'BANK_NOT_FOUND' | 'ACCOUNT_NUMBER_EXISTS' }> {
        const bankAccountRepo = DI.em.getRepository(BankAccount)
        const transferencistaRepo = DI.em.getRepository(Transferencista)
        const bankRepo = DI.em.getRepository(Bank)

        let transferencista: Transferencista | null = null

        // Determinar el transferencista
        if (createdBy.role === UserRole.TRANSFERENCISTA) {
            // Transferencista crea su propia cuenta
            transferencista = await transferencistaRepo.findOne({ user: createdBy.id })
            if (!transferencista) {
                return { error: 'TRANSFERENCISTA_NOT_FOUND' }
            }
        } else if (createdBy.role === UserRole.ADMIN || createdBy.role === UserRole.SUPER_ADMIN) {
            // Admin/SuperAdmin crea cuenta para otro transferencista
            if (!data.transferenciaId) {
                return { error: 'TRANSFERENCISTA_NOT_FOUND' }
            }
            transferencista = await transferencistaRepo.findOne({ id: data.transferenciaId })
            if (!transferencista) {
                return { error: 'TRANSFERENCISTA_NOT_FOUND' }
            }
        }

        if (!transferencista) {
            return { error: 'TRANSFERENCISTA_NOT_FOUND' }
        }

        // Verificar que el banco exista
        const bank = await bankRepo.findOne({ id: data.bankId })
        if (!bank) {
            return { error: 'BANK_NOT_FOUND' }
        }

        // Verificar que no exista una cuenta con el mismo número para este transferencista
        const existingAccount = await bankAccountRepo.findOne({
            transferencista: transferencista.id,
            accountNumber: data.accountNumber
        })
        if (existingAccount) {
            return { error: 'ACCOUNT_NUMBER_EXISTS' }
        }

        // Crear cuenta bancaria
        const bankAccount = bankAccountRepo.create({
            transferencista,
            bank,
            accountNumber: data.accountNumber,
            accountHolder: data.accountHolder,
            accountType: data.accountType,
            balance: data.balance || 0
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

        const accounts = await bankAccountRepo.find(
            { transferencista: transferenciaId },
            { populate: ['bank'] }
        )

        return accounts
    }

    /**
     * Actualiza el balance de una cuenta bancaria
     */
    async updateBalance(
        bankAccountId: string,
        newBalance: number
    ): Promise<BankAccount | { error: 'BANK_ACCOUNT_NOT_FOUND' | 'INVALID_BALANCE' }> {
        const bankAccountRepo = DI.em.getRepository(BankAccount)

        if (newBalance < 0) {
            return { error: 'INVALID_BALANCE' }
        }

        const bankAccount = await bankAccountRepo.findOne({ id: bankAccountId })
        if (!bankAccount) {
            return { error: 'BANK_ACCOUNT_NOT_FOUND' }
        }

        bankAccount.balance = newBalance
        await DI.em.persistAndFlush(bankAccount)

        return bankAccount
    }

    /**
     * Obtiene una cuenta bancaria por ID
     */
    async getBankAccountById(
        bankAccountId: string
    ): Promise<BankAccount | { error: 'BANK_ACCOUNT_NOT_FOUND' }> {
        const bankAccountRepo = DI.em.getRepository(BankAccount)

        const bankAccount = await bankAccountRepo.findOne(
            { id: bankAccountId },
            { populate: ['bank', 'transferencista', 'transferencista.user'] }
        )

        if (!bankAccount) {
            return { error: 'BANK_ACCOUNT_NOT_FOUND' }
        }

        return bankAccount
    }
}

export const bankAccountService = new BankAccountService()
