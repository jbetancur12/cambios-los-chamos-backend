import { wrap } from '@mikro-orm/core'
import { DI } from '@/di'
import { CobranzaClient } from '@/entities/CobranzaClient'
import { CreditStatus } from '@/entities/Credit'
import { Payment, PaymentStatus } from '@/entities/Payment'
import { creditService, CreditView } from './CreditService'

export interface CreateCobranzaClientInput {
  name: string
  identification: string
  phone?: string
  address?: string
  notes?: string
}

// Objeto plano: los campos agregados a la entidad de MikroORM se pierden al serializar a JSON
export interface ClientListItem extends CobranzaClient {
  activeCredits: number
  totalDebt: number
  overdueAmount: number
}

export class CobranzaClientService {
  async create(data: CreateCobranzaClientInput): Promise<CobranzaClient | { error: 'DUPLICATE_IDENTIFICATION' }> {
    const existing = await DI.cobranzaClients.findOne({ identification: data.identification })
    if (existing) {
      return { error: 'DUPLICATE_IDENTIFICATION' }
    }

    const client = DI.cobranzaClients.create({
      name: data.name,
      identification: data.identification,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(client)
    return client
  }

  async list(params: { search?: string; page?: number; limit?: number }): Promise<{
    items: ClientListItem[]
    total: number
  }> {
    const where: Record<string, unknown> = {}
    if (params.search) {
      where['$or'] = [
        { name: { $ilike: `%${params.search}%` } },
        { identification: { $ilike: `%${params.search}%` } },
        { phone: { $ilike: `%${params.search}%` } },
      ]
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [clients, total] = await DI.cobranzaClients.findAndCount(where, {
      orderBy: { name: 'ASC' },
      limit,
      offset,
    })

    // Deuda y mora de los clientes de la página (una sola consulta)
    const credits = clients.length
      ? await DI.credits.find({ client: { $in: clients.map((c) => c.id) }, status: CreditStatus.ACTIVE })
      : []
    const byClient = new Map<string, { activeCredits: number; totalDebt: number; overdueAmount: number }>()
    for (const credit of credits) {
      const view = creditService.toView(credit)
      const entry = byClient.get(credit.client.id) ?? { activeCredits: 0, totalDebt: 0, overdueAmount: 0 }
      entry.activeCredits += 1
      entry.totalDebt += view.balance
      entry.overdueAmount += view.overdueAmount
      byClient.set(credit.client.id, entry)
    }

    const items = clients.map(
      (client) =>
        ({
          ...wrap(client).toObject(),
          ...(byClient.get(client.id) ?? { activeCredits: 0, totalDebt: 0, overdueAmount: 0 }),
        }) as ClientListItem
    )
    return { items, total }
  }

  async getDetail(id: string): Promise<{
    client: CobranzaClient
    credits: CreditView[]
    payments: Payment[]
    summary: { totalDebt: number; overdueAmount: number; totalPaid: number }
  } | null> {
    const client = await DI.cobranzaClients.findOne({ id })
    if (!client) return null

    const credits = await DI.credits.find({ client: id }, { populate: ['client'], orderBy: { createdAt: 'DESC' } })
    const views = credits.map((c) => creditService.toView(c))
    const payments = await DI.payments.find(
      { client: id, status: PaymentStatus.COMPLETED },
      { populate: ['credit'], orderBy: { paymentDate: 'DESC' }, limit: 50 }
    )

    const active = views.filter((v) => v.status === CreditStatus.ACTIVE)
    return {
      client,
      credits: views,
      payments,
      summary: {
        totalDebt: active.reduce((sum, v) => sum + v.balance, 0),
        overdueAmount: active.reduce((sum, v) => sum + v.overdueAmount, 0),
        totalPaid: views.reduce((sum, v) => sum + v.totalPaid, 0),
      },
    }
  }

  async update(
    id: string,
    data: Partial<CreateCobranzaClientInput>
  ): Promise<CobranzaClient | { error: 'CLIENT_NOT_FOUND' | 'DUPLICATE_IDENTIFICATION' }> {
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

    if (data.name !== undefined) client.name = data.name
    if (data.identification !== undefined) client.identification = data.identification
    if (data.phone !== undefined) client.phone = data.phone
    if (data.address !== undefined) client.address = data.address
    if (data.notes !== undefined) client.notes = data.notes

    await DI.em.persistAndFlush(client)
    return client
  }

  async remove(id: string): Promise<true | { error: 'CLIENT_NOT_FOUND' | 'HAS_CREDITS' }> {
    const client = await DI.cobranzaClients.findOne({ id })
    if (!client) {
      return { error: 'CLIENT_NOT_FOUND' }
    }
    if ((await DI.credits.count({ client: id })) > 0) {
      return { error: 'HAS_CREDITS' }
    }
    await DI.em.removeAndFlush(client)
    return true
  }
}

export const cobranzaClientService = new CobranzaClientService()
