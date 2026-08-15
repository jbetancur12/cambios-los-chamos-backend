import { DI } from '@/di'
import { ClientCategory } from '@/entities/ClientCategory'

export interface CreateClientCategoryInput {
  code: string
  name: string
  description?: string
  isActive?: boolean
  minOverdueCount?: number | null
  maxOverdueCount?: number | null
  maxAmount?: number | null
  minAmount?: number
  maxCredits?: number | null
}

export class ClientCategoryService {
  async create(data: CreateClientCategoryInput): Promise<ClientCategory | { error: 'DUPLICATE_CODE' }> {
    const existing = await DI.clientCategories.findOne({ code: data.code })
    if (existing) {
      return { error: 'DUPLICATE_CODE' }
    }

    const category = DI.clientCategories.create({
      code: data.code,
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
      minOverdueCount: data.minOverdueCount ?? undefined,
      maxOverdueCount: data.maxOverdueCount ?? undefined,
      maxAmount: data.maxAmount ?? undefined,
      minAmount: data.minAmount ?? 0,
      maxCredits: data.maxCredits ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(category)
    return category
  }

  async list(activeOnly = false): Promise<ClientCategory[]> {
    const where = activeOnly ? { isActive: true } : {}
    return DI.clientCategories.find(where, { orderBy: { name: 'ASC' } })
  }

  async getById(id: string): Promise<ClientCategory | null> {
    return DI.clientCategories.findOne({ id })
  }

  async update(
    id: string,
    data: Partial<CreateClientCategoryInput>
  ): Promise<ClientCategory | { error: 'CATEGORY_NOT_FOUND' | 'DUPLICATE_CODE' }> {
    const category = await DI.clientCategories.findOne({ id })
    if (!category) {
      return { error: 'CATEGORY_NOT_FOUND' }
    }

    if (data.code && data.code !== category.code) {
      const existing = await DI.clientCategories.findOne({ code: data.code })
      if (existing && existing.id !== id) {
        return { error: 'DUPLICATE_CODE' }
      }
    }

    if (data.code !== undefined) category.code = data.code
    if (data.name !== undefined) category.name = data.name
    if (data.description !== undefined) category.description = data.description
    if (data.isActive !== undefined) category.isActive = data.isActive
    if (data.minOverdueCount !== undefined) category.minOverdueCount = data.minOverdueCount ?? undefined
    if (data.maxOverdueCount !== undefined) category.maxOverdueCount = data.maxOverdueCount ?? undefined
    if (data.maxAmount !== undefined) category.maxAmount = data.maxAmount ?? undefined
    if (data.minAmount !== undefined) category.minAmount = data.minAmount
    if (data.maxCredits !== undefined) category.maxCredits = data.maxCredits ?? undefined

    await DI.em.persistAndFlush(category)
    return category
  }

  async toggleActive(id: string): Promise<ClientCategory | { error: 'CATEGORY_NOT_FOUND' }> {
    const category = await DI.clientCategories.findOne({ id })
    if (!category) {
      return { error: 'CATEGORY_NOT_FOUND' }
    }
    category.isActive = !category.isActive
    await DI.em.persistAndFlush(category)
    return category
  }

  async remove(id: string): Promise<boolean | { error: 'CATEGORY_NOT_FOUND' | 'IN_USE' }> {
    const category = await DI.clientCategories.findOne({ id })
    if (!category) {
      return { error: 'CATEGORY_NOT_FOUND' }
    }

    const clientsUsing = await DI.cobranzaClients.count({ category: id })
    if (clientsUsing > 0) {
      return { error: 'IN_USE' }
    }

    await DI.em.removeAndFlush(category)
    return true
  }

  async getStatistics(): Promise<{
    totalCategories: number
    clientsByCategory: { code: string; name: string; clientCount: number; activeClientCount: number }[]
  }> {
    const categories = await DI.clientCategories.find({}, { orderBy: { name: 'ASC' } })

    const clientsByCategory: { code: string; name: string; clientCount: number; activeClientCount: number }[] = []
    for (const cat of categories) {
      const clientCount = await DI.cobranzaClients.count({ category: cat.id })
      const activeClientCount = await DI.cobranzaClients.count({ category: cat.id, isActive: true })
      clientsByCategory.push({ code: cat.code, name: cat.name, clientCount, activeClientCount })
    }

    return { totalCategories: categories.length, clientsByCategory }
  }
}

export const clientCategoryService = new ClientCategoryService()
