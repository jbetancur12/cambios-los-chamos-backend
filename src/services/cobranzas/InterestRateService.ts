import { DI } from '@/di'
import { InterestRate } from '@/entities/InterestRate'

export interface CreateInterestRateInput {
  name?: string
  rate: number
  isActive?: boolean
}

export class InterestRateService {
  async create(data: CreateInterestRateInput, userId: string): Promise<InterestRate> {
    const userRef = DI.users.getReference(userId)
    const rate = DI.interestRates.create({
      name: data.name,
      rate: data.rate,
      isActive: data.isActive ?? true,
      createdBy: userRef,
      updatedBy: userRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(rate)
    return rate
  }

  async list(activeOnly = false): Promise<InterestRate[]> {
    const where = activeOnly ? { isActive: true } : {}
    return DI.interestRates.find(where, {
      populate: ['createdBy', 'updatedBy'],
      orderBy: { createdAt: 'DESC' },
    })
  }

  async getById(id: string): Promise<InterestRate | null> {
    return DI.interestRates.findOne({ id })
  }

  async update(
    id: string,
    data: Partial<CreateInterestRateInput>,
    userId: string
  ): Promise<InterestRate | { error: 'RATE_NOT_FOUND' }> {
    const rate = await DI.interestRates.findOne({ id })
    if (!rate) {
      return { error: 'RATE_NOT_FOUND' }
    }

    if (data.name !== undefined) rate.name = data.name
    if (data.rate !== undefined) rate.rate = data.rate
    if (data.isActive !== undefined) rate.isActive = data.isActive
    rate.updatedBy = DI.users.getReference(userId)

    await DI.em.persistAndFlush(rate)
    return rate
  }

  async toggleActive(id: string): Promise<InterestRate | { error: 'RATE_NOT_FOUND' }> {
    const rate = await DI.interestRates.findOne({ id })
    if (!rate) {
      return { error: 'RATE_NOT_FOUND' }
    }
    rate.isActive = !rate.isActive
    await DI.em.persistAndFlush(rate)
    return rate
  }

  async remove(id: string): Promise<boolean | { error: 'RATE_NOT_FOUND' }> {
    const rate = await DI.interestRates.findOne({ id })
    if (!rate) {
      return { error: 'RATE_NOT_FOUND' }
    }

    await DI.em.removeAndFlush(rate)
    return true
  }
}

export const interestRateService = new InterestRateService()
