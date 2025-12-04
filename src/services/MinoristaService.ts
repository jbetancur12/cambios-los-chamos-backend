import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { Minorista } from '@/entities/Minorista'
import { makePassword } from '@/lib/passwordUtils'
import { minoristaTransactionService } from './MinoristaTransactionService'
import { MinoristaTransactionType } from '@/entities/MinoristaTransaction'

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
      creditLimit: 0,
      availableCredit: 0,
      creditBalance: 0,
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

      creditLimit: number
      availableCredit: number
      creditBalance: number
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
      creditLimit: m.creditLimit,
      availableCredit: m.availableCredit,
      creditBalance: m.creditBalance,
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
   * Obtiene un minorista por ID de usuario
   */
  async getMinoristaByUserId(userId: string): Promise<
    | {
      id: string

      creditLimit: number
      availableCredit: number
      creditBalance: number
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

    const minorista = await minoristaRepo.findOne({ user: userId }, { populate: ['user'] })

    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    return {
      id: minorista.id,
      creditLimit: minorista.creditLimit,
      availableCredit: minorista.availableCredit,
      creditBalance: minorista.creditBalance,
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
   * Obtiene un minorista por ID
   */
  async getMinoristaById(minoristaId: string): Promise<
    | {
      id: string
      creditLimit: number
      availableCredit: number
      creditBalance: number
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
      creditLimit: minorista.creditLimit,
      availableCredit: minorista.availableCredit,
      creditBalance: minorista.creditBalance,
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

    await DI.em.persistAndFlush(minorista)

    return {
      id: minorista.id,
    }
  }

  /**
   * Asigna un cupo de crédito a un minorista
   * El crédito disponible se establece al valor del límite
   */
  async setCreditLimit(
    minoristaId: string,
    creditLimit: number
  ): Promise<
    | {
      id: string
      creditLimit: number
      availableCredit: number
      creditBalance: number
      user: {
        id: string
        fullName: string
        email: string
      }
    }
    | { error: 'MINORISTA_NOT_FOUND' }
  > {
    const minoristaRepo = DI.em.getRepository(Minorista)

    const minorista = await minoristaRepo.findOne({ id: minoristaId }, { populate: ['user'] })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Calcular el crédito usado actual (deuda)
    const usedCredit = minorista.creditLimit - minorista.availableCredit

    minorista.creditLimit = creditLimit
    // El nuevo crédito disponible es el nuevo límite menos lo que ya se usó
    minorista.availableCredit = creditLimit - usedCredit

    // Si hay diferencia positiva, crear transacción de recarga
    // if (creditLimit > oldCreditLimit) {
    //   const difference = creditLimit - oldCreditLimit
    //   await minoristaTransactionService.createTransaction({
    //     minoristaId,
    //     amount: difference,
    //     type: MinoristaTransactionType.RECHARGE,
    //     createdBy,
    //   })
    // }

    await DI.em.persistAndFlush(minorista)

    return {
      id: minorista.id,
      creditLimit: minorista.creditLimit,
      availableCredit: minorista.availableCredit,
      creditBalance: minorista.creditBalance,
      user: {
        id: minorista.user.id,
        fullName: minorista.user.fullName,
        email: minorista.user.email,
      },
    }
  }

  /**
   * Procesa un pago de deuda que restaura el crédito disponible
   * Si paga más de la deuda, el exceso se convierte en saldo a favor
   */
  async payDebt(
    minoristaId: string,
    amount: number,
    createdBy: User
  ): Promise<
    | {
      id: string
      creditLimit: number
      availableCredit: number
      creditBalance: number
      debtAmount: number
      user: {
        id: string
        fullName: string
        email: string
      }
    }
    | { error: 'MINORISTA_NOT_FOUND' | 'INSUFFICIENT_PAYMENT' }
  > {
    const minoristaRepo = DI.em.getRepository(Minorista)

    const minorista = await minoristaRepo.findOne({ id: minoristaId }, { populate: ['user'] })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Calcular la deuda (cuanto crédito falta para llegar al límite)
    const debtAmount = minorista.creditLimit - minorista.availableCredit

    // Procesar el pago
    if (amount <= debtAmount) {
      // Pago parcial o exacto: solo restaurar crédito
      const transactionResult = await minoristaTransactionService.createTransaction({
        minoristaId,
        amount,
        type: MinoristaTransactionType.RECHARGE,
        createdBy,
      })

      if ('error' in transactionResult) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }
    } else {
      // Pago mayor a la deuda: usar deuda para restaurar crédito y resto va a saldo a favor
      const excessAmount = amount - debtAmount

      // Restaurar todo el crédito (pagar toda la deuda)
      const transactionResult = await minoristaTransactionService.createTransaction({
        minoristaId,
        amount: debtAmount,
        type: MinoristaTransactionType.RECHARGE,
        createdBy,
      })

      if ('error' in transactionResult) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }

      // Refrescar el minorista para obtener los valores actualizados después de la primera transacción
      const updatedMinorista = await minoristaRepo.findOne({ id: minoristaId })
      if (updatedMinorista) {
        minorista.availableCredit = updatedMinorista.availableCredit
        minorista.creditBalance = updatedMinorista.creditBalance
      }

      // Crear una transacción para el exceso que se convierte en saldo a favor
      const excessTransactionResult = await minoristaTransactionService.createTransaction({
        minoristaId,
        amount: excessAmount,
        type: MinoristaTransactionType.RECHARGE,
        createdBy,
        updateBalanceInFavor: true, // El exceso va al creditBalance (saldo a favor)
      })

      if ('error' in excessTransactionResult) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }
    }

    // Refrescar los datos del minorista
    await minoristaRepo.populate(minorista, ['user'])

    return {
      id: minorista.id,
      creditLimit: minorista.creditLimit,
      availableCredit: minorista.availableCredit,
      creditBalance: minorista.creditBalance,
      debtAmount: Math.max(0, minorista.creditLimit - minorista.availableCredit),
      user: {
        id: minorista.user.id,
        fullName: minorista.user.fullName,
        email: minorista.user.email,
      },
    }
  }
}

export const minoristaService = new MinoristaService()
