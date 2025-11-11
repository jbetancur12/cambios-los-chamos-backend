// src/services/TransferencistaService.ts
import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { makePassword } from '@/lib/passwordUtils'
import { giroService } from '@/services/GiroService'

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
  > {
    const transferencistaRepo = DI.em.getRepository(Transferencista)

    const transferencista = await transferencistaRepo.findOne({ id: transferencistaId })
    if (!transferencista) {
      return { error: 'TRANSFERENCISTA_NOT_FOUND' }
    }

    const previousAvailability = transferencista.available
    transferencista.available = available
    await DI.em.persistAndFlush(transferencista)

    // Si se marcó como NO disponible, redistribuir sus giros pendientes
    if (!available && previousAvailability) {
      const redistribution = await giroService.redistributePendingGiros(transferencistaId)

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
