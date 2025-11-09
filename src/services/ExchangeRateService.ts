import { DI } from '@/di'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { User } from '@/entities/User'

export interface CreateExchangeRateInput {
  copToBs: number
  usdToBs: number
  bcvValue: number
  createdBy: User
}

export class ExchangeRateService {
  /**
   * Crea una nueva tasa de cambio
   */
  async createExchangeRate(data: CreateExchangeRateInput): Promise<ExchangeRate> {
    const exchangeRateRepo = DI.em.getRepository(ExchangeRate)

    const exchangeRate = exchangeRateRepo.create({
      copToBs: data.copToBs,
      usdToBs: data.usdToBs,
      bcvValue: data.bcvValue,
      createdBy: data.createdBy,
      createdAt: new Date(),
    })

    await DI.em.persistAndFlush(exchangeRate)

    return exchangeRate
  }

  /**
   * Obtiene la tasa de cambio actual (la más reciente)
   */
  async getCurrentRate(): Promise<ExchangeRate | { error: 'NO_RATE_FOUND' }> {
    const exchangeRateRepo = DI.em.getRepository(ExchangeRate)

    const currentRate = await exchangeRateRepo.findOne(
      {},
      {
        orderBy: { createdAt: 'DESC' },
        populate: ['createdBy'],
      }
    )

    if (!currentRate) {
      return { error: 'NO_RATE_FOUND' }
    }

    return currentRate
  }

  /**
   * Lista todas las tasas de cambio con paginación
   */
  async listExchangeRates(options?: { page?: number; limit?: number }): Promise<{
    total: number
    page: number
    limit: number
    rates: Array<{
      id: string
      copToBs: number
      usdToBs: number
      bcvValue: number
      createdBy: {
        id: string
        fullName: string
        email: string
      }
      createdAt: Date
    }>
  }> {
    const exchangeRateRepo = DI.em.getRepository(ExchangeRate)

    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    const [rates, total] = await exchangeRateRepo.findAndCount(
      {},
      {
        limit,
        offset,
        populate: ['createdBy'],
        orderBy: { createdAt: 'DESC' }, // Más recientes primero
      }
    )

    const data = rates.map((rate) => ({
      id: rate.id,
      copToBs: rate.copToBs,
      usdToBs: rate.usdToBs,
      bcvValue: rate.bcvValue,
      createdBy: {
        id: rate.createdBy.id,
        fullName: rate.createdBy.fullName,
        email: rate.createdBy.email,
      },
      createdAt: rate.createdAt,
    }))

    return {
      total,
      page,
      limit,
      rates: data,
    }
  }

  /**
   * Obtiene una tasa de cambio por ID
   */
  async getExchangeRateById(rateId: string): Promise<
    | {
        id: string
        copToBs: number
        usdToBs: number
        bcvValue: number
        createdBy: {
          id: string
          fullName: string
          email: string
        }
        createdAt: Date
      }
    | { error: 'RATE_NOT_FOUND' }
  > {
    const exchangeRateRepo = DI.em.getRepository(ExchangeRate)

    const rate = await exchangeRateRepo.findOne({ id: rateId }, { populate: ['createdBy'] })

    if (!rate) {
      return { error: 'RATE_NOT_FOUND' }
    }

    return {
      id: rate.id,
      copToBs: rate.copToBs,
      usdToBs: rate.usdToBs,
      bcvValue: rate.bcvValue,
      createdBy: {
        id: rate.createdBy.id,
        fullName: rate.createdBy.fullName,
        email: rate.createdBy.email,
      },
      createdAt: rate.createdAt,
    }
  }
}

export const exchangeRateService = new ExchangeRateService()
