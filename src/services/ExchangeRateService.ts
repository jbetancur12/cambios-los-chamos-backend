import { DI } from '@/di'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { User } from '@/entities/User'

export interface CreateExchangeRateInput {
  buyRate: number
  sellRate: number
  usd: number
  bcv: number
  createdBy: User
}

export class ExchangeRateService {
  /**
   * Crea una nueva tasa de cambio
   */
  async createExchangeRate(data: CreateExchangeRateInput): Promise<ExchangeRate> {
    const exchangeRateRepo = DI.em.getRepository(ExchangeRate)

    const exchangeRate = exchangeRateRepo.create({
      buyRate: data.buyRate,
      sellRate: data.sellRate,
      usd: data.usd,
      bcv: data.bcv,
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

    const rates = await exchangeRateRepo.find(
      {},
      {
        orderBy: { createdAt: 'DESC' },
        populate: ['createdBy'],
        limit: 1,
      }
    )

    if (rates.length === 0) {
      return { error: 'NO_RATE_FOUND' }
    }

    return rates[0]
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
      buyRate: number
      sellRate: number
      usd: number
      bcv: number
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
      buyRate: rate.buyRate,
      sellRate: rate.sellRate,
      usd: rate.usd,
      bcv: rate.bcv,
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
        buyRate: number
        sellRate: number
        usd: number
        bcv: number
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
      buyRate: rate.buyRate,
      sellRate: rate.sellRate,
      usd: rate.usd,
      bcv: rate.bcv,
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
