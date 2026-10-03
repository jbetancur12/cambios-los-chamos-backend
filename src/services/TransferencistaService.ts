// src/services/TransferencistaService.ts
import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { TransferencistaAssignmentTracker } from '@/entities/TransferencistaAssignmentTracker'
import { LockMode } from '@mikro-orm/core'
import { AVAILABLE_TRANSFERENCISTA } from '@/lib/transferencistaPool'
import { makePassword } from '@/lib/passwordUtils'
import { giroService } from '@/services/GiroService'
import { giroSocketManager } from '@/websocket'
import { logger } from '@/lib/logger'

class TransferencistaService {
  async createTransferencista(data: { fullName: string; email: string; password: string; available?: boolean }) {
    const userRepo = DI.em.getRepository(User)
    const transferencistaRepo = DI.em.getRepository(Transferencista)

    // Verificar si ya existe un usuario con el mismo email
    const existingUser = await userRepo.findOne({ email: data.email })
    if (existingUser) {
      throw new Error('Email ya registrado')
    }

    // Hash de contraseña
    const hashedPassword = makePassword(data.password)

    // Crear usuario
    const user = userRepo.create({
      fullName: data.fullName,
      email: data.email,
      password: hashedPassword,
      role: UserRole.TRANSFERENCISTA,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Crear Transferencista asociado
    const transferencista = transferencistaRepo.create({
      user,
      available: data.available ?? true,
      bankAccounts: [],
      giros: [],
    })

    // Guardar ambos en la misma transacción
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush(user)
      await em.persistAndFlush(transferencista)
    })

    // Retornar datos (sin contraseña)
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
      },
      transferencista: {
        id: transferencista.id,
        available: transferencista.available,
      },
    }
  }

  async listTransferencistas(options?: { page?: number; limit?: number }) {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    const transferencistaRepo = DI.em.getRepository(Transferencista)

    const [transferencistas, total] = await transferencistaRepo.findAndCount(
      {},
      {
        limit,
        offset,
        populate: ['user'], // para traer la relación User
      }
    )

    // Retornar solo campos públicos
    const data = transferencistas.map((t) => ({
      id: t.id,
      available: t.available,
      user: {
        id: t.user.id,
        fullName: t.user.fullName,
        email: t.user.email,
        role: t.user.role,
        isActive: t.user.isActive,
      },
    }))

    return {
      total,
      page,
      limit,
      transferencistas: data,
    }
  }

  async setAvailability(
    transferencistaId: string,
    available: boolean
  ): Promise<
    | {
        success: true
        available: boolean
        girosRedistributed?: number
        redistributionErrors?: number
      }
    | { error: 'TRANSFERENCISTA_NOT_FOUND' }
    | { error: 'LAST_AVAILABLE' }
  > {
    const outcome = await DI.em.transactional(async (em) => {
      // The assignment tracker row works as the lock that serializes changes to the pool: two requests that
      // disable the last two available transferencistas at the same time can no longer both succeed.
      await em.findOne(TransferencistaAssignmentTracker, { id: 1 }, { lockMode: LockMode.PESSIMISTIC_WRITE })

      const transferencista = await em.findOne(Transferencista, { id: transferencistaId })
      if (!transferencista) {
        return { error: 'TRANSFERENCISTA_NOT_FOUND' as const }
      }

      const wasAvailable = transferencista.available

      // Evitar que todos queden no disponibles. Only a transferencista that is really in the pool counts:
      // available, with an active user that is not archived.
      if (!available && wasAvailable) {
        const pool = await em.find(Transferencista, AVAILABLE_TRANSFERENCISTA)
        const isInPool = pool.some((t) => t.id === transferencista.id)
        if (isInPool && pool.length <= 1) {
          return { error: 'LAST_AVAILABLE' as const }
        }
      }

      transferencista.available = available
      await em.flush()
      return { wasAvailable }
    })

    if (outcome.error) {
      return { error: outcome.error }
    }

    const previousAvailability = outcome.wasAvailable

    // Si se marcó como NO disponible, redistribuir sus giros pendientes
    if (!available && previousAvailability) {
      const redistribution = await giroService.redistributePendingGiros(transferencistaId)

      // Emit WebSocket events for reassigned giros
      if (redistribution.reassignedGiros && redistribution.reassignedGiros.length > 0) {
        if (giroSocketManager) {
          logger.info(`Broadcasting ${redistribution.reassignedGiros.length} reassigned giros via WebSocket`)
          for (const giro of redistribution.reassignedGiros) {
            giroSocketManager.broadcastGiroAssigned(giro)
          }
        } else {
          logger.warn('giroSocketManager is undefined during redistribution broadcast')
        }
      }

      return {
        success: true,
        available: false,
        girosRedistributed: redistribution.redistributed,
        redistributionErrors: redistribution.errors,
      }
    }

    return {
      success: true,
      available,
    }
  }
}

export const transferencistaService = new TransferencistaService()
