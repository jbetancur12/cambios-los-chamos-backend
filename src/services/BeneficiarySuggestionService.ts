import { DI } from '@/di'
import { BeneficiarySuggestion } from '@/entities/BeneficiarySuggestion'
import { User } from '@/entities/User'
import { ExecutionType } from '@/entities/Giro'

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

    // Check if this beneficiary already exists for this user and execution type
    const whereClause: any = {
      user: userId,
      beneficiaryName: data.beneficiaryName,
      beneficiaryId: data.beneficiaryId,
      executionType: data.executionType,
    }
    if (data.phone) {
      whereClause.phone = data.phone
    }
    const existing = await DI.em.getRepository(BeneficiarySuggestion).findOne(whereClause)

    if (existing) {
      // Update the existing record (move it to recent)
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
    })

    await DI.em.persistAndFlush(suggestion)
    return suggestion
  }

  async getBeneficiarySuggestions(userId: string, executionType?: ExecutionType, limit: number = 50): Promise<BeneficiarySuggestion[]> {
    const where: any = { user: userId }
    if (executionType) {
      where.executionType = executionType
    }

    return await DI.em.getRepository(BeneficiarySuggestion).find(
      where,
      {
        orderBy: { updatedAt: 'DESC' },
        limit,
      }
    )
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

    const searchLower = `%${searchTerm.toLowerCase()}%`
    const orConditions: any[] = [
      { beneficiaryName: { $ilike: searchLower } },
      { beneficiaryId: { $ilike: searchLower } },
    ]
    // Only search by phone if it's not empty
    if (searchTerm.trim()) {
      orConditions.push({ phone: { $ilike: searchLower } })
    }
    const where: any = {
      user: userId,
      $or: orConditions,
    }

    if (executionType) {
      where.executionType = executionType
    }

    return await DI.em.getRepository(BeneficiarySuggestion).find(
      where,
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
