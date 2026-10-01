import { DI } from '@/di'
import { FilterQuery } from '@mikro-orm/core'
import { BeneficiarySuggestion } from '@/entities/BeneficiarySuggestion'
import { User } from '@/entities/User'
import { ExecutionType } from '@/entities/Giro'
import { normalizeText } from '@/utils/textUtils'
import {
  BeneficiarySuggestionLog,
  BeneficiarySuggestionLogAction,
  BeneficiarySuggestionChanges,
} from '@/entities/BeneficiarySuggestionLog'
import { logger } from '@/lib/logger'

const TRACKED_FIELDS = [
  'beneficiaryName',
  'beneficiaryId',
  'phone',
  'senderPhone',
  'bankId',
  'accountNumber',
  'executionType',
] as const

const snapshotOf = (s: BeneficiarySuggestion): Record<string, string | null> =>
  Object.fromEntries(TRACKED_FIELDS.map((f) => [f, s[f] ?? null]))

export class BeneficiarySuggestionService {
  /**
   * Registra un evento de auditoría. Nunca debe romper la operación principal.
   */
  private async logEvent(
    action: BeneficiarySuggestionLogAction,
    user: User,
    suggestion: BeneficiarySuggestion,
    extra: { giroId?: string; changes?: BeneficiarySuggestionChanges } = {}
  ): Promise<void> {
    try {
      const entry = new BeneficiarySuggestionLog({
        action,
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        suggestionId: suggestion.id,
        giroId: extra.giroId,
        executionType: suggestion.executionType,
        beneficiaryId: suggestion.beneficiaryId,
        beneficiaryName: suggestion.beneficiaryName,
        phone: suggestion.phone || undefined,
        changes: extra.changes && Object.keys(extra.changes).length > 0 ? extra.changes : undefined,
        snapshot: snapshotOf(suggestion),
      })
      await DI.em.persistAndFlush(entry)
    } catch (error) {
      logger.warn({ error }, 'Error al registrar auditoría de sugerencia de beneficiario')
    }
  }

  async saveBeneficiarySuggestion(
    userId: string,
    data: {
      beneficiaryName: string
      beneficiaryId: string
      phone?: string
      senderPhone?: string // Teléfono del remitente, opcional
      bankId: string
      accountNumber: string
      executionType: ExecutionType
      suggestionId?: string
      giroId?: string // Giro que disparó el guardado, solo para auditoría
    }
  ): Promise<BeneficiarySuggestion> {
    // Get user from the same EntityManager context
    const user = await DI.em.getRepository(User).findOne({ id: userId })
    if (!user) {
      throw new Error('User not found')
    }

    const repo = DI.em.getRepository(BeneficiarySuggestion)

    // If a specific suggestion id is provided, update that row in place (allows fixing the cedula too)
    if (data.suggestionId) {
      const byId = await repo.findOne({ id: data.suggestionId, user: userId })
      if (byId) {
        const before = snapshotOf(byId)
        byId.beneficiaryName = data.beneficiaryName
        byId.beneficiaryId = data.beneficiaryId
        byId.phone = data.phone
        byId.senderPhone = data.senderPhone
        byId.bankId = data.bankId
        byId.accountNumber = data.accountNumber
        byId.executionType = data.executionType
        byId.updatedAt = new Date()
        await DI.em.persistAndFlush(byId)
        const changes = this.diff(before, snapshotOf(byId))
        if (Object.keys(changes).length > 0) {
          await this.logEvent('ACTUALIZADA', user, byId, { giroId: data.giroId, changes })
        }
        return byId
      }
    }

    // Without a suggestionId, only an identical destination counts as the same suggestion:
    // cedula + phone for PAGO_MOVIL, cedula + bank + account otherwise. Any other change creates a new row.
    const whereClause: FilterQuery<BeneficiarySuggestion> =
      data.executionType === ExecutionType.PAGO_MOVIL
        ? {
            user: userId,
            beneficiaryId: data.beneficiaryId,
            executionType: data.executionType,
            phone: data.phone,
          }
        : {
            user: userId,
            beneficiaryId: data.beneficiaryId,
            executionType: data.executionType,
            bankId: data.bankId,
            accountNumber: data.accountNumber,
          }

    const existing = await repo.findOne(whereClause)

    if (existing) {
      // Same destination: refresh name and sender phone and move to recent
      const before = snapshotOf(existing)
      existing.beneficiaryName = data.beneficiaryName
      existing.senderPhone = data.senderPhone
      existing.updatedAt = new Date()
      await DI.em.persistAndFlush(existing)
      // Only log when something actually changed (e.g. the name); a plain refresh is not worth a row
      const changes = this.diff(before, snapshotOf(existing))
      if (Object.keys(changes).length > 0) {
        await this.logEvent('ACTUALIZADA', user, existing, { giroId: data.giroId, changes })
      }
      return existing
    }

    // Create new beneficiary suggestion using repo.create() for proper ORM registration
    const suggestion = repo.create({
      user,
      beneficiaryName: data.beneficiaryName,
      beneficiaryId: data.beneficiaryId,
      phone: data.phone,
      senderPhone: data.senderPhone,
      bankId: data.bankId,
      accountNumber: data.accountNumber,
      executionType: data.executionType,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(suggestion)
    await this.logEvent('CREADA', user, suggestion, { giroId: data.giroId })
    return suggestion
  }

  private diff(
    before: Record<string, string | null>,
    after: Record<string, string | null>
  ): BeneficiarySuggestionChanges {
    const changes: BeneficiarySuggestionChanges = {}
    for (const field of TRACKED_FIELDS) {
      // Treat undefined, null and empty string as the same "empty" value
      const oldValue = before[field] || null
      const newValue = after[field] || null
      if (oldValue !== newValue) changes[field] = { old: oldValue, new: newValue }
    }
    return changes
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
        normalizedName.includes(normalizedSearch) ||
        normalizedId.includes(normalizedSearch) ||
        normalizedAccountNumber.includes(normalizedSearch)
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

    const user = await DI.em.getRepository(User).findOne({ id: userId })
    await DI.em.removeAndFlush(suggestion)
    if (user) await this.logEvent('ELIMINADA', user, suggestion)
    return true
  }

  async deleteAllBeneficiarySuggestions(userId: string): Promise<number> {
    const repo = DI.em.getRepository(BeneficiarySuggestion)
    const suggestions = await repo.find({ user: userId })
    const user = await DI.em.getRepository(User).findOne({ id: userId })
    for (const suggestion of suggestions) {
      await DI.em.removeAndFlush(suggestion)
      if (user) await this.logEvent('ELIMINADA', user, suggestion)
    }
    return suggestions.length
  }
}

export const beneficiarySuggestionService = new BeneficiarySuggestionService()
