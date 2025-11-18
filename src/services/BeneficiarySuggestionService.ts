import { DI } from '@/di'
import { BeneficiarySuggestion } from '@/entities/BeneficiarySuggestion'
import { User } from '@/entities/User'

export class BeneficiarySuggestionService {
  async saveBeneficiarySuggestion(
    userId: string,
    data: {
      beneficiaryName: string
      beneficiaryId: string
      phone: string
      bankId: string
      accountNumber: string
    }
  ): Promise<BeneficiarySuggestion> {
    const user = await DI.users.findOne({ id: userId })
    if (!user) {
      throw new Error('User not found')
    }

    // Check if this beneficiary already exists for this user
    const existing = await DI.em.getRepository(BeneficiarySuggestion).findOne({
      user: userId,
      beneficiaryName: data.beneficiaryName,
      beneficiaryId: data.beneficiaryId,
      phone: data.phone,
    })

    if (existing) {
      // Update the existing record (move it to recent)
      existing.updatedAt = new Date()
      await DI.em.persistAndFlush(existing)
      return existing
    }

    // Create new beneficiary suggestion
    const suggestion = new BeneficiarySuggestion({
      user,
      beneficiaryName: data.beneficiaryName,
      beneficiaryId: data.beneficiaryId,
      phone: data.phone,
      bankId: data.bankId,
      accountNumber: data.accountNumber,
    })

    await DI.em.persistAndFlush(suggestion)
    return suggestion
  }

  async getBeneficiarySuggestions(userId: string, limit: number = 50): Promise<BeneficiarySuggestion[]> {
    return await DI.em.getRepository(BeneficiarySuggestion).find(
      { user: userId },
      {
        orderBy: { updatedAt: 'DESC' },
        limit,
      }
    )
  }

  async searchBeneficiarySuggestions(
    userId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<BeneficiarySuggestion[]> {
    if (!searchTerm.trim()) {
      return await this.getBeneficiarySuggestions(userId, limit)
    }

    const searchLower = `%${searchTerm.toLowerCase()}%`

    return await DI.em.getRepository(BeneficiarySuggestion).find(
      {
        user: userId,
        $or: [
          { beneficiaryName: { $ilike: searchLower } },
          { beneficiaryId: { $ilike: searchLower } },
          { phone: { $ilike: searchLower } },
        ],
      },
      {
        orderBy: { updatedAt: 'DESC' },
        limit,
      }
    )
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
