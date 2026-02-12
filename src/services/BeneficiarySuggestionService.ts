import { DI } from '@/di'
import { FilterQuery } from '@mikro-orm/core'
import { BeneficiarySuggestion } from '@/entities/BeneficiarySuggestion'
import { User } from '@/entities/User'
import { ExecutionType } from '@/entities/Giro'
import { normalizeText } from '@/utils/textUtils'

export class BeneficiarySuggestionService {
  async saveBeneficiarySuggestion(
    userId: string,
    data: {
      beneficiaryName: string
      beneficiaryId: string
      phone?: string
      bankId: string
      accountNumber: string
      executionType: ExecutionType
    }
  ): Promise<BeneficiarySuggestion> {
    // Get user from the same EntityManager context
    const user = await DI.em.getRepository(User).findOne({ id: userId })
    if (!user) {
      throw new Error('User not found')
    }

    // Check if this beneficiary already exists for this user and execution type using CEDULA as unique key
    const whereClause: FilterQuery<BeneficiarySuggestion> = {
      user: userId,
      beneficiaryId: data.beneficiaryId,
      executionType: data.executionType,
    }

    const existing = await DI.em.getRepository(BeneficiarySuggestion).findOne(whereClause)

    if (existing) {
      // Update the existing record with new details (name, phone, bank, etc) and move to recent
      existing.beneficiaryName = data.beneficiaryName
      existing.phone = data.phone
      existing.bankId = data.bankId
      existing.accountNumber = data.accountNumber
      existing.updatedAt = new Date()
      await DI.em.persistAndFlush(existing)
      return existing
    }

    // Create new beneficiary suggestion using repo.create() for proper ORM registration
    const repo = DI.em.getRepository(BeneficiarySuggestion)
    const suggestion = repo.create({
      user,
      beneficiaryName: data.beneficiaryName,
      beneficiaryId: data.beneficiaryId,
      phone: data.phone,
      bankId: data.bankId,
      accountNumber: data.accountNumber,
      executionType: data.executionType,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(suggestion)
    return suggestion
  }

  async getBeneficiarySuggestions(
    userId: string,
    executionType?: ExecutionType,
    limit: number = 50
  ): Promise<BeneficiarySuggestion[]> {
    const where: FilterQuery<BeneficiarySuggestion> = { user: userId }
    if (executionType) {
      where.executionType = executionType
    }

    return await DI.em.getRepository(BeneficiarySuggestion).find(where, {
      orderBy: { updatedAt: 'DESC' },
      limit,
    })
  }

  async searchBeneficiarySuggestions(
    userId: string,
    searchTerm: string,
    executionType?: ExecutionType,
    limit: number = 20
  ): Promise<BeneficiarySuggestion[]> {
    if (!searchTerm.trim()) {
      return await this.getBeneficiarySuggestions(userId, executionType, limit)
    }

    // Normalize search term to be accent-insensitive
    const normalizedSearch = normalizeText(searchTerm)
    const searchPattern = `%${normalizedSearch}%`

    const where: FilterQuery<BeneficiarySuggestion> = {
      user: userId,
    }

    if (executionType) {
      where.executionType = executionType
    }

    // Get all suggestions and filter in-memory for accent-insensitive search
    const allSuggestions = await DI.em.getRepository(BeneficiarySuggestion).find(where, {
      orderBy: { updatedAt: 'DESC' },
    })

    // Filter by normalized name, ID or Account Number
    const filtered = allSuggestions.filter(suggestion => {
      const normalizedName = normalizeText(suggestion.beneficiaryName)
      const normalizedId = normalizeText(suggestion.beneficiaryId)
      const normalizedAccountNumber = normalizeText(suggestion.accountNumber)

      return (
        normalizedName.startsWith(normalizedSearch) ||
        normalizedId.startsWith(normalizedSearch) ||
        normalizedAccountNumber.startsWith(normalizedSearch)
      )
    })

    return filtered.slice(0, limit)
  }

  async deleteBeneficiarySuggestion(userId: string, suggestionId: string): Promise<boolean> {
    const suggestion = await DI.em.getRepository(BeneficiarySuggestion).findOne({
      id: suggestionId,
      user: userId,
    })

    if (!suggestion) {
      return false
    }

    await DI.em.removeAndFlush(suggestion)
    return true
  }

  async deleteAllBeneficiarySuggestions(userId: string): Promise<number> {
    const repo = DI.em.getRepository(BeneficiarySuggestion)
    const suggestions = await repo.find({ user: userId })
    for (const suggestion of suggestions) {
      await DI.em.removeAndFlush(suggestion)
    }
    return suggestions.length
  }
}

export const beneficiarySuggestionService = new BeneficiarySuggestionService()
