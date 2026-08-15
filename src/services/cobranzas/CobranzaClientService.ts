import { DI } from '@/di'
import { CobranzaClient } from '@/entities/CobranzaClient'
import { ClientCategory } from '@/entities/ClientCategory'
import { Credit } from '@/entities/Credit'
import { CreditStatus } from '@/entities/Credit'
import { Payment } from '@/entities/Payment'

export interface CreateCobranzaClientInput {
  name: string
  identification: string
  phone?: string
  email?: string
  address?: string
  categoryId?: string | null
  creditLimitOverride?: number | null
  maxCreditsOverride?: number | null
  latitude?: number | null
  longitude?: number | null
  notes?: string
}

export class CobranzaClientService {
  async create(
    data: CreateCobranzaClientInput
  ): Promise<CobranzaClient | { error: 'DUPLICATE_IDENTIFICATION' | 'CATEGORY_NOT_FOUND' }> {
    const existing = await DI.cobranzaClients.findOne({ identification: data.identification })
    if (existing) {
      return { error: 'DUPLICATE_IDENTIFICATION' }
    }

    let category: ClientCategory | undefined
    if (data.categoryId) {
      const found = await DI.clientCategories.findOne({ id: data.categoryId })
      if (!found) {
        return { error: 'CATEGORY_NOT_FOUND' }
      }
      category = found as ClientCategory
    }

    const client = DI.cobranzaClients.create({
      name: data.name,
      identification: data.identification,
      phone: data.phone,
      email: data.email,
      address: data.address,
      category: (category ?? undefined) as ClientCategory | undefined,
      creditLimitOverride: data.creditLimitOverride ?? undefined,
      maxCreditsOverride: data.maxCreditsOverride ?? undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      notes: data.notes,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(client)
    return client
  }

  async list(params: {
    search?: string
    activeOnly?: boolean
    categoryId?: string
    page?: number
    limit?: number
  }): Promise<{ items: CobranzaClient[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (params.activeOnly) where.isActive = true
    if (params.categoryId) where.category = params.categoryId
    if (params.search) {
      where['$or'] = [
        { name: { $ilike: `%${params.search}%` } },
        { identification: { $ilike: `%${params.search}%` } },
        { phone: { $ilike: `%${params.search}%` } },
      ]
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [items, total] = await DI.cobranzaClients.findAndCount(where, {
      populate: ['category'],
      orderBy: { name: 'ASC' },
      limit,
      offset,
    })

    return { items, total }
  }

  async getById(id: string): Promise<CobranzaClient | null> {
    return DI.cobranzaClients.findOne({ id }, { populate: ['category', 'routes'] })
  }

  async update(
    id: string,
    data: Partial<CreateCobranzaClientInput>
  ): Promise<CobranzaClient | { error: 'CLIENT_NOT_FOUND' | 'DUPLICATE_IDENTIFICATION' | 'CATEGORY_NOT_FOUND' }> {
    const client = await DI.cobranzaClients.findOne({ id })
    if (!client) {
      return { error: 'CLIENT_NOT_FOUND' }
    }

    if (data.identification && data.identification !== client.identification) {
      const existing = await DI.cobranzaClients.findOne({ identification: data.identification })
      if (existing && existing.id !== id) {
        return { error: 'DUPLICATE_IDENTIFICATION' }
      }
    }

    if (data.categoryId !== undefined) {
      if (!data.categoryId) {
        client.category = undefined
      } else {
        const category = await DI.clientCategories.findOne({ id: data.categoryId })
        if (!category) {
          return { error: 'CATEGORY_NOT_FOUND' }
        }
        client.category = category
      }
    }

    if (data.name !== undefined) client.name = data.name
    if (data.identification !== undefined) client.identification = data.identification
    if (data.phone !== undefined) client.phone = data.phone
    if (data.email !== undefined) client.email = data.email
    if (data.address !== undefined) client.address = data.address
    if (data.creditLimitOverride !== undefined) client.creditLimitOverride = data.creditLimitOverride ?? undefined
    if (data.maxCreditsOverride !== undefined) client.maxCreditsOverride = data.maxCreditsOverride ?? undefined
    if (data.latitude !== undefined) client.latitude = data.latitude ?? undefined
    if (data.longitude !== undefined) client.longitude = data.longitude ?? undefined
    if (data.notes !== undefined) client.notes = data.notes

    await DI.em.persistAndFlush(client)
    return client
  }

  async toggleActive(id: string): Promise<CobranzaClient | { error: 'CLIENT_NOT_FOUND' }> {
    const client = await DI.cobranzaClients.findOne({ id })
    if (!client) {
      return { error: 'CLIENT_NOT_FOUND' }
    }
    client.isActive = !client.isActive
    await DI.em.persistAndFlush(client)
    return client
  }

  async remove(id: string): Promise<boolean | { error: 'CLIENT_NOT_FOUND' | 'HAS_CREDITS' }> {
    const client = await DI.cobranzaClients.findOne({ id })
    if (!client) {
      return { error: 'CLIENT_NOT_FOUND' }
    }

    const activeCredits = await DI.credits.count({
      client: id,
      status: { $nin: [CreditStatus.PAID_OFF, CreditStatus.CANCELLED, CreditStatus.DEFAULTED] },
    })
    if (activeCredits > 0) {
      return { error: 'HAS_CREDITS' }
    }

    await DI.payments.nativeDelete({ client: id })
    await DI.credits.nativeDelete({ client: id })
    await DI.em.removeAndFlush(client)
    return true
  }

  async getStats(): Promise<{
    total: number
    active: number
    byCategory: { code: string; name: string; count: number }[]
  }> {
    const total = await DI.cobranzaClients.count()
    const active = await DI.cobranzaClients.count({ isActive: true })

    const categories = await DI.clientCategories.find({}, { orderBy: { name: 'ASC' } })
    const byCategory: { code: string; name: string; count: number }[] = []
    for (const cat of categories) {
      const count = await DI.cobranzaClients.count({ category: cat.id })
      byCategory.push({ code: cat.code, name: cat.name, count })
    }

    return { total, active, byCategory }
  }

  async getActiveCredits(clientId: string): Promise<Credit[]> {
    return DI.credits.find(
      {
        client: clientId,
        status: { $nin: [CreditStatus.PAID_OFF, CreditStatus.CANCELLED, CreditStatus.DEFAULTED] },
      } as never,
      { orderBy: { createdAt: 'DESC' } }
    )
  }

  async getPaymentHistory(clientId: string): Promise<Payment[]> {
    return DI.payments.find({ client: clientId }, { populate: ['credit'], orderBy: { paymentDate: 'DESC' }, limit: 50 })
  }
}

export const cobranzaClientService = new CobranzaClientService()
