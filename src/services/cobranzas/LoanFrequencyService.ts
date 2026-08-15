import { DI } from '@/di'
import { LoanFrequency } from '@/entities/LoanFrequency'

export class LoanFrequencyService {
  async create(data: {
    code: string
    name: string
    description?: string
    isEnabled?: boolean
    isFixedDuration?: boolean
    fixedInstallments?: number | null
    fixedDurationDays?: number | null
    periodDays: number
    defaultInstallments?: number | null
    minInstallments?: number | null
    maxInstallments?: number | null
    interestRate?: number | null
  }): Promise<LoanFrequency | { error: 'DUPLICATE_CODE' }> {
    const existing = await DI.loanFrequencies.findOne({ code: data.code })
    if (existing) {
      return { error: 'DUPLICATE_CODE' }
    }

    const freq = DI.loanFrequencies.create({
      code: data.code,
      name: data.name,
      description: data.description,
      isEnabled: data.isEnabled ?? true,
      isFixedDuration: data.isFixedDuration ?? false,
      fixedInstallments: data.fixedInstallments ?? undefined,
      fixedDurationDays: data.fixedDurationDays ?? undefined,
      periodDays: data.periodDays,
      defaultInstallments: data.defaultInstallments ?? undefined,
      minInstallments: data.minInstallments ?? undefined,
      maxInstallments: data.maxInstallments ?? undefined,
      interestRate: data.interestRate ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(freq)
    return freq
  }

  async list(enabledOnly = true): Promise<LoanFrequency[]> {
    const where = enabledOnly ? { isEnabled: true } : {}
    return DI.loanFrequencies.find(where, { orderBy: { periodDays: 'ASC' } })
  }

  async getByCode(code: string): Promise<LoanFrequency | null> {
    return DI.loanFrequencies.findOne({ code })
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description?: string
      isEnabled: boolean
      isFixedDuration: boolean
      fixedInstallments?: number | null
      fixedDurationDays?: number | null
      periodDays: number
      defaultInstallments?: number | null
      minInstallments?: number | null
      maxInstallments?: number | null
      interestRate?: number | null
    }>
  ): Promise<LoanFrequency | { error: 'FREQUENCY_NOT_FOUND' }> {
    const freq = await DI.loanFrequencies.findOne({ id })
    if (!freq) {
      return { error: 'FREQUENCY_NOT_FOUND' }
    }

    if (data.name !== undefined) freq.name = data.name
    if (data.description !== undefined) freq.description = data.description
    if (data.isEnabled !== undefined) freq.isEnabled = data.isEnabled
    if (data.isFixedDuration !== undefined) freq.isFixedDuration = data.isFixedDuration
    if (data.fixedInstallments !== undefined) freq.fixedInstallments = data.fixedInstallments ?? undefined
    if (data.fixedDurationDays !== undefined) freq.fixedDurationDays = data.fixedDurationDays ?? undefined
    if (data.periodDays !== undefined) freq.periodDays = data.periodDays
    if (data.defaultInstallments !== undefined) freq.defaultInstallments = data.defaultInstallments ?? undefined
    if (data.minInstallments !== undefined) freq.minInstallments = data.minInstallments ?? undefined
    if (data.maxInstallments !== undefined) freq.maxInstallments = data.maxInstallments ?? undefined
    if (data.interestRate !== undefined) freq.interestRate = data.interestRate ?? undefined

    await DI.em.persistAndFlush(freq)
    return freq
  }
}

export const loanFrequencyService = new LoanFrequencyService()
