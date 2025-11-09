import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { Minorista } from '@/entities/Minorista'
import { makePassword } from '@/lib/passwordUtils'

export interface CreateMinoristaInput {
  fullName: string
  email: string
  password: string
  balance?: number
}

export class MinoristaService {
  /**
   * Crea un usuario minorista con su perfil asociado
   */
  async createMinorista(data: CreateMinoristaInput): Promise<
    | {
        user: {
          id: string
          fullName: string
          email: string
          role: UserRole
          isActive: boolean
          emailVerified: boolean
        }
        minorista: {
          id: string
          balance: number
        }
      }
    | { error: 'EMAIL_ALREADY_EXISTS' }
  > {
    const userRepo = DI.em.getRepository(User)
    const minoristaRepo = DI.em.getRepository(Minorista)

    // Verificar si ya existe un usuario con el mismo email
    const existingUser = await userRepo.findOne({ email: data.email })
    if (existingUser) {
      return { error: 'EMAIL_ALREADY_EXISTS' }
    }

    // Hash de contraseña
    const hashedPassword = makePassword(data.password)

    // Crear usuario
    const user = userRepo.create({
      fullName: data.fullName,
      email: data.email,
      password: hashedPassword,
      role: UserRole.MINORISTA,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Crear Minorista asociado
    const minorista = minoristaRepo.create({
      user,
      balance: data.balance ?? 0,
      transactions: [],
      giros: [],
    })

    // Guardar ambos en la misma transacción
    await DI.em.transactional(async (em) => {
      await em.persistAndFlush(user)
      await em.persistAndFlush(minorista)
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
      minorista: {
        id: minorista.id,
        balance: minorista.balance,
      },
    }
  }

  /**
   * Lista todos los minoristas con paginación
   */
  async listMinoristas(options?: { page?: number; limit?: number }): Promise<{
    total: number
    page: number
    limit: number
    minoristas: Array<{
      id: string
      balance: number
      user: {
        id: string
        fullName: string
        email: string
        role: UserRole
        isActive: boolean
      }
    }>
  }> {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    const minoristaRepo = DI.em.getRepository(Minorista)

    const [minoristas, total] = await minoristaRepo.findAndCount(
      {},
      {
        limit,
        offset,
        populate: ['user'],
      }
    )

    // Retornar solo campos públicos
    const data = minoristas.map((m) => ({
      id: m.id,
      balance: m.balance,
      user: {
        id: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.user.role,
        isActive: m.user.isActive,
      },
    }))

    return {
      total,
      page,
      limit,
      minoristas: data,
    }
  }

  /**
   * Obtiene un minorista por ID
   */
  async getMinoristaById(minoristaId: string): Promise<
    | {
        id: string
        balance: number
        user: {
          id: string
          fullName: string
          email: string
          role: UserRole
          isActive: boolean
        }
      }
    | { error: 'MINORISTA_NOT_FOUND' }
  > {
    const minoristaRepo = DI.em.getRepository(Minorista)

    const minorista = await minoristaRepo.findOne({ id: minoristaId }, { populate: ['user'] })

    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    return {
      id: minorista.id,
      balance: minorista.balance,
      user: {
        id: minorista.user.id,
        fullName: minorista.user.fullName,
        email: minorista.user.email,
        role: minorista.user.role,
        isActive: minorista.user.isActive,
      },
    }
  }

  /**
   * @deprecated Use minoristaTransactionService.createTransaction instead
   * Este método NO crea registro de auditoría. Usar MinoristaTransactionService para
   * asegurar que todas las modificaciones de balance queden en el historial.
   */
  async updateBalance(
    minoristaId: string,
    newBalance: number
  ): Promise<
    | {
        id: string
        balance: number
      }
    | { error: 'MINORISTA_NOT_FOUND' | 'INVALID_BALANCE' }
  > {
    if (newBalance < 0) {
      return { error: 'INVALID_BALANCE' }
    }

    const minoristaRepo = DI.em.getRepository(Minorista)

    const minorista = await minoristaRepo.findOne({ id: minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    minorista.balance = newBalance
    await DI.em.persistAndFlush(minorista)

    return {
      id: minorista.id,
      balance: minorista.balance,
    }
  }
}

export const minoristaService = new MinoristaService()
