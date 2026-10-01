import type { EntityName } from '@mikro-orm/postgresql'
import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { Minorista } from '@/entities/Minorista'
import { Transferencista } from '@/entities/Transferencista'
import { Bank, Currency } from '@/entities/Bank'
import { BankAccount, BankAccountOwnerType, AccountType } from '@/entities/BankAccount'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { ExecutionType } from '@/entities/Giro'
import { TransferencistaAssignmentTracker } from '@/entities/TransferencistaAssignmentTracker'
import type { CreateGiroInput } from '@/types/giro'

let sequence = 0
const next = () => ++sequence

// em.create() demands every property, including the ones that have defaults, so the data is cast
const make = <T extends object>(entity: EntityName<T>, data: object): T => DI.em.create(entity, data as never) as T

const save = async <T extends object>(entity: T): Promise<T> => {
  DI.em.persist(entity)
  await DI.em.flush()
  return entity
}

export const createUser = (role: UserRole, overrides: Partial<User> = {}) => {
  const n = next()
  return save(
    make(User, {
      fullName: `${role} ${n}`,
      email: `${role.toLowerCase()}${n}@test.local`,
      password: 'not-a-real-hash',
      role,
      isActive: true,
      emailVerified: true,
      ...overrides,
    })
  )
}

export const createAdmin = () => createUser(UserRole.ADMIN)

export interface MinoristaOptions {
  creditLimit?: number
  availableCredit?: number
  creditBalance?: number
  profitPercentage?: number
  isActive?: boolean
}

export const createMinorista = async (options: MinoristaOptions = {}) => {
  const creditLimit = options.creditLimit ?? 1_000_000
  const user = await createUser(UserRole.MINORISTA, { isActive: options.isActive ?? true })
  const minorista = await save(
    make(Minorista, {
      user,
      creditLimit,
      availableCredit: options.availableCredit ?? creditLimit,
      creditBalance: options.creditBalance ?? 0,
      profitPercentage: options.profitPercentage ?? 0.05,
    })
  )
  return { user, minorista }
}

export const createTransferencista = async (options: { available?: boolean } = {}) => {
  const user = await createUser(UserRole.TRANSFERENCISTA)
  const transferencista = await save(make(Transferencista, { user, available: options.available ?? true }))
  return { user, transferencista }
}

export const createBank = (overrides: Partial<Bank> = {}) => {
  const n = next()
  return save(make(Bank, { name: `Banco ${n}`, currency: Currency.VES, code: 100 + n, ...overrides }))
}

export const createBankAccount = (transferencista: Transferencista, bank: Bank, balance = 10_000_000) =>
  save(
    make(BankAccount, {
      transferencista,
      ownerType: BankAccountOwnerType.TRANSFERENCISTA,
      ownerId: transferencista.id,
      bank,
      accountNumber: `0102${next()}`,
      accountHolder: 'Titular de prueba',
      accountType: AccountType.CORRIENTE,
      balance,
    })
  )

/** Default rate: sell 100, buy 90, so 100,000 COP leaves a 10,000 profit. */
export const createRate = (createdBy: User, overrides: Partial<ExchangeRate> = {}) =>
  save(
    make(ExchangeRate, {
      buyRate: 90,
      sellRate: 100,
      usd: 4000,
      bcv: 40,
      createdBy,
      ...overrides,
    })
  )

/** A valid giro request. 100,000 COP at sell 100 is 1,000 Bs. */
export const giroInput = (
  bank: Bank,
  rateApplied: ExchangeRate,
  overrides: Partial<CreateGiroInput> = {}
): CreateGiroInput => ({
  rateApplied,
  beneficiaryName: 'Beneficiario de prueba',
  beneficiaryId: '12345678',
  bankId: bank.id,
  accountNumber: '01020000000000000001',
  phone: '',
  amountInput: 100_000,
  currencyInput: Currency.COP,
  amountBs: 1_000,
  executionType: ExecutionType.TRANSFERENCIA,
  ...overrides,
})

/** The round-robin tracker is a single row created on first use; pre-create it to avoid that race in tests. */
export const createAssignmentTracker = () =>
  save(make(TransferencistaAssignmentTracker, { id: 1, lastAssignedIndex: 0 }))
