import { DI } from '@/di'
import { Giro, GiroStatus, ExecutionType } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { CreateGiroInput } from '@/types/giro'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { bankAccountTransactionService } from '@/services/BankAccountTransactionService'
import { BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { sendGiroAssignedNotification } from '@/lib/notification_sender'
import { exchangeRateService } from '@/services/ExchangeRateService'
import { beneficiarySuggestionService } from '@/services/BeneficiarySuggestionService'
import { Currency } from '@/entities/Bank'

export class GiroService {
  /**
   * Encuentra el siguiente transferencista disponible usando distribución round-robin
   * Distribuye los giros equitativamente entre TODOS los transferencistas disponibles
   */
  private async findNextAvailableTransferencista(): Promise<Transferencista | null> {
    // Obtener todos los transferencistas disponibles, ordenados por ID para consistencia
    const availableTransferencistas = await DI.transferencistas.find(
      { available: true },
      {
        populate: ['user'],
        orderBy: { id: 'ASC' },
      }
    )

    if (availableTransferencistas.length === 0) {
      return null
    }

    // Obtener o crear el tracker de asignación
    let tracker = await DI.transferencistaAssignmentTracker.findOne({ id: 1 })

    if (!tracker) {
      // Crear el tracker si no existe (primera vez)
      tracker = DI.transferencistaAssignmentTracker.create({
        id: 1,
        lastAssignedIndex: 0,
        updatedAt: new Date(),
      })
      await DI.em.persistAndFlush(tracker)
    }

    // Calcular el siguiente índice (round-robin)
    const nextIndex = (tracker.lastAssignedIndex + 1) % availableTransferencistas.length
    const selectedTransferencista = availableTransferencistas[nextIndex]

    // Actualizar el tracker
    tracker.lastAssignedIndex = nextIndex
    tracker.updatedAt = new Date()
    await DI.em.persistAndFlush(tracker)

    return selectedTransferencista
  }

  /**
   * Crea un giro. El origen del saldo depende de quién lo crea:
   * - Minorista: descuenta de su balance (requiere minoristaId)
   * - Admin/SuperAdmin: asigna transferencista (descuento será al ejecutar, NO requiere minoristaId)
   */
  async createGiro(
    data: CreateGiroInput,
    createdBy: User
  ): Promise<
    Giro | { error: 'MINORISTA_NOT_FOUND' | 'NO_TRANSFERENCISTA_ASSIGNED' | 'INSUFFICIENT_BALANCE' | 'BANK_NOT_FOUND' }
  > {
    // VALIDACIÓN 1: Verificar que el banco destino exista
    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    // VALIDACIÓN 2: Verificar transferencista disponible
    const assigned = await this.findNextAvailableTransferencista()
    if (!assigned) {
      return { error: 'NO_TRANSFERENCISTA_ASSIGNED' }
    }

    // VALIDACIÓN 3: Si es minorista, verificar que exista y tenga balance suficiente
    let minorista: Minorista | undefined = undefined
    if (createdBy.role === UserRole.MINORISTA) {
      if (!data.minoristaId) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }

      const minoristaRepo = DI.em.getRepository(Minorista)
      const foundMinorista = await minoristaRepo.findOne({ id: data.minoristaId }, { populate: ['user'] })

      if (!foundMinorista) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }

      // Verificar balance ANTES de descontar
      if (foundMinorista.availableCredit < data.amountInput) {
        return { error: 'INSUFFICIENT_BALANCE' }
      }

      minorista = foundMinorista
    }

    // TODAS LAS VALIDACIONES PASARON - Ahora proceder con una transacción de base de datos
    // Si algo falla dentro de esta transacción, todo se revierte (rollback)
    return await DI.em.transactional(async (em) => {
      const giroRepo = em.getRepository(Giro)

      // Descontar balance del minorista si aplica
      if (createdBy.role === UserRole.MINORISTA && minorista) {
        // Crear transacción de descuento del balance del minorista
        const transactionResult = await minoristaTransactionService.createTransaction({
          minoristaId: minorista.id,
          amount: data.amountInput,
          type: MinoristaTransactionType.DISCOUNT,
          createdBy,
        })

        if ('error' in transactionResult) {
          throw new Error('INSUFFICIENT_BALANCE')
        }

        // Recargar minorista para obtener balance actualizado
        await em.refresh(minorista)
      }

      // Calcular ganancias: ((monto / sellRate) * buyRate) - monto
      const totalProfit = data.amountInput - (data.amountInput / data.rateApplied.sellRate) * data.rateApplied.buyRate

      let systemProfit = 0
      let minoristaProfit = 0

      if (createdBy.role === UserRole.MINORISTA && minorista) {
        // Minorista: 5% para él, 95% para el sistema
        minoristaProfit = data.amountInput * 0.05
        systemProfit = totalProfit - minoristaProfit

        // Crear transacción de ganancia para el minorista
        const profitTransaction = await minoristaTransactionService.createTransaction({
          minoristaId: minorista.id,
          amount: minoristaProfit,
          type: MinoristaTransactionType.PROFIT,
          createdBy,
        })

        if ('error' in profitTransaction) {
          throw new Error('Error al crear transacción de ganancia')
        }

        // Recargar minorista para obtener balance actualizado
        await em.refresh(minorista)
      } else {
        // Admin/SuperAdmin: 100% para el sistema
        systemProfit = totalProfit
        minoristaProfit = 0
      }

      // Crear giro
      const giro = giroRepo.create({
        minorista, // Puede ser undefined para admin/superadmin
        transferencista: assigned,
        beneficiaryName: data.beneficiaryName,
        beneficiaryId: data.beneficiaryId,
        bankName: bank.name, // Nombre del banco destino para registro histórico
        accountNumber: data.accountNumber,
        phone: data.phone,
        rateApplied: data.rateApplied,
        amountInput: data.amountInput,
        currencyInput: data.currencyInput,
        amountBs: data.amountBs,
        bcvValueApplied: data.rateApplied.bcv,
        executionType: data.executionType,
        systemProfit,
        minoristaProfit,
        status: GiroStatus.ASIGNADO,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Persistir el giro dentro de la transacción
      em.persist(giro)
      await em.flush()

      // Actualizar las transacciones del minorista para vincularlas al giro
      if (createdBy.role === UserRole.MINORISTA && minorista) {
        const transactionRepo = em.getRepository(MinoristaTransaction)
        const minoristaTransactions = await transactionRepo.find(
          {
            minorista: minorista.id,
            giro: { $eq: null }, // Transacciones sin giro vinculado
            type: { $in: [MinoristaTransactionType.DISCOUNT, MinoristaTransactionType.PROFIT] }
          },
          { orderBy: { createdAt: 'DESC' as const }, limit: 2 } // Las últimas 2 (descuento y ganancia)
        )

        // Vincular las transacciones a este giro
        for (const transaction of minoristaTransactions) {
          (transaction as MinoristaTransaction).giro = giro
          em.persist(transaction)
        }
        await em.flush()
      }

      // Enviar notificación después de que la transacción se complete exitosamente
      await sendGiroAssignedNotification(assigned.user.id, giro.id, giro.amountBs)

      return giro
    }).then(async (giro) => {
      // Guardar sugerencia de beneficiario DESPUÉS de la transacción exitosa
      if ('error' in giro) {
        return giro
      }

      try {
        await beneficiarySuggestionService.saveBeneficiarySuggestion(createdBy.id, {
          beneficiaryName: data.beneficiaryName,
          beneficiaryId: data.beneficiaryId,
          phone: data.phone || '',
          bankId: data.bankId,
          accountNumber: data.accountNumber,
          executionType: data.executionType || ExecutionType.TRANSFERENCIA,
        })
      } catch (error) {
        // No fallar si no se puede guardar la sugerencia
        console.warn('Error al guardar sugerencia de beneficiario:', error)
      }

      return giro
    }).catch((error) => {
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return { error: 'INSUFFICIENT_BALANCE' as const }
      }
      console.error('Error al crear giro:', error)
      throw error
    })
  }

  /**
   * Ejecuta un giro. El transferencista selecciona cuenta y tipo de ejecución.
   * Valida balance y descuenta de la cuenta del transferencista.
   */
  async executeGiro(
    giroId: string,
    bankAccountId: string,
    executionType: ExecutionType,
    fee: number
  ): Promise<
    | Giro
    | {
        error:
          | 'GIRO_NOT_FOUND'
          | 'INVALID_STATUS'
          | 'BANK_ACCOUNT_NOT_FOUND'
          | 'INSUFFICIENT_BALANCE'
          | 'UNAUTHORIZED_ACCOUNT'
      }
  > {
    console.log('🚀 ~ GiroService ~ executeGiro ~ fee:', fee)
    const giro = await DI.giros.findOne(
      { id: giroId },
      {
        populate: [
          'transferencista',
          'transferencista.user',
          'minorista',
          'minorista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    // Solo giros ASIGNADOS o PROCESANDO pueden ejecutarse
    if (giro.status !== GiroStatus.ASIGNADO && giro.status !== GiroStatus.PROCESANDO) {
      return { error: 'INVALID_STATUS' }
    }

    const bankAccount = await DI.bankAccounts.findOne({ id: bankAccountId }, { populate: ['transferencista', 'bank'] })

    if (!bankAccount) {
      return { error: 'BANK_ACCOUNT_NOT_FOUND' }
    }

    // Verificar que la cuenta pertenezca al transferencista del giro
    if (giro.transferencista?.id !== bankAccount.transferencista.id) {
      return { error: 'UNAUTHORIZED_ACCOUNT' }
    }

    // Crear transacción de retiro de la cuenta bancaria
    const transactionResult = await bankAccountTransactionService.createTransaction({
      bankAccountId: bankAccount.id,
      amount: giro.amountBs,
      fee,
      type: BankAccountTransactionType.WITHDRAWAL,
      reference: `Giro ${giro.id}`,
      createdBy: giro.transferencista.user,
    })

    if ('error' in transactionResult) {
      return { error: 'INSUFFICIENT_BALANCE' }
    }

    // Recargar cuenta para obtener balance actualizado
    await DI.em.refresh(bankAccount)

    // Actualizar giro - DO NOT store proofUrl, only the key
    giro.bankAccountUsed = bankAccount
    giro.executionType = executionType
    giro.status = GiroStatus.COMPLETADO
    giro.completedAt = new Date()
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    return giro
  }

  async returnGiro(giroId: string, reason: string): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
    const giroRepo = DI.em.getRepository(Giro)

    const giro = await giroRepo.findOne(
      { id: giroId },
      {
        populate: [
          'minorista',
          'minorista.user',
          'transferencista',
          'transferencista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    // Solo giros ASIGNADOS o PROCESANDO pueden ser devueltos
    if (giro.status !== GiroStatus.ASIGNADO && giro.status !== GiroStatus.PROCESANDO) {
      return { error: 'INVALID_STATUS' }
    }

    giro.status = GiroStatus.DEVUELTO
    giro.returnReason = reason
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    // Si el giro tiene minorista, reembolsar el monto
    // if (giro.minorista) {
    //   await minoristaTransactionService.createTransaction({
    //     minoristaId: giro.minorista.id,
    //     amount: giro.amountInput,
    //     type: MinoristaTransactionType.REFUND,
    //     createdBy: giro.createdBy,
    //   })
    // }

    return giro
  }

  /**
   * Permite al transferencista marcar un giro como en proceso
   */
  async markAsProcessing(giroId: string): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
    const giroRepo = DI.em.getRepository(Giro)

    const giro = await giroRepo.findOne(
      { id: giroId },
      {
        populate: [
          'minorista',
          'minorista.user',
          'transferencista',
          'transferencista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    if (giro.status !== GiroStatus.ASIGNADO) {
      return { error: 'INVALID_STATUS' }
    }

    giro.status = GiroStatus.PROCESANDO
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    return giro
  }

  /**
   * Redistribuye todos los giros pendientes de un transferencista a otros disponibles
   * Se llama cuando un transferencista se marca como no disponible
   */
  async redistributePendingGiros(transferencistaId: string): Promise<{
    redistributed: number
    errors: number
  }> {
    // Encontrar todos los giros pendientes o en proceso del transferencista
    const pendingGiros = await DI.giros.find({
      transferencista: transferencistaId,
      status: { $in: [GiroStatus.ASIGNADO, GiroStatus.PROCESANDO] },
    })

    let redistributed = 0
    let errors = 0

    for (const giro of pendingGiros) {
      try {
        // Encontrar nuevo transferencista usando round-robin
        const newTransferencista = await this.findNextAvailableTransferencista()

        if (!newTransferencista) {
          // No hay transferencistas disponibles, dejar el giro como está
          errors++
          continue
        }

        // Reasignar el giro
        giro.transferencista = newTransferencista
        giro.status = GiroStatus.ASIGNADO // Resetear a ASIGNADO si estaba PROCESANDO
        giro.updatedAt = new Date()

        redistributed++
      } catch (error) {
        console.error(`Error redistribuyendo giro ${giro.id}:`, error)
        errors++
      }
    }

    // Guardar todos los cambios
    if (pendingGiros.length > 0) {
      await DI.em.persistAndFlush(pendingGiros)
    }

    return { redistributed, errors }
  }

  /**
   * Lista giros con filtros y permisos según rol
   */
  async listGiros(options: {
    userId: string
    userRole: UserRole
    status?: GiroStatus
    dateFrom?: Date
    dateTo?: Date
    page?: number
    limit?: number
  }): Promise<{
    giros: Giro[]
    total: number
    page: number
    limit: number
  }> {
    const page = options.page ?? 1
    const limit = options.limit ?? 50
    const offset = (page - 1) * limit

    // Construir filtros base según rol
    const where: any = {}

    if (options.userRole === UserRole.TRANSFERENCISTA) {
      // Transferencista: solo giros asignados a él
      const transferencista = await DI.transferencistas.findOne({ user: options.userId })
      if (!transferencista) {
        return { giros: [], total: 0, page, limit }
      }
      where.transferencista = transferencista.id
    } else if (options.userRole === UserRole.MINORISTA) {
      // Minorista: solo sus giros
      const minorista = await DI.minoristas.findOne({ user: options.userId })
      if (!minorista) {
        return { giros: [], total: 0, page, limit }
      }
      where.minorista = minorista.id
    }
    // SUPER_ADMIN/ADMIN: ven todos los giros (sin filtro adicional)

    // Filtros opcionales
    if (options.status) {
      where.status = options.status
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {}

      if (options.dateFrom) {
        // Dates are in local timezone (created by new Date(year, month, day))
        // getTimezoneOffset() returns negative values for timezones EAST of UTC (e.g., -300 for UTC-5)
        // To convert local to UTC: ADD the offset (negate the negative to get positive)
        // Local 2025-11-18 00:00 UTC-5 = UTC 2025-11-18 05:00
        const offsetMillis = new Date().getTimezoneOffset() * 60 * 1000
        const utcStart = new Date(options.dateFrom.getTime() + offsetMillis)
        where.createdAt.$gte = utcStart
      }
      if (options.dateTo) {
        // Same logic as dateFrom
        const offsetMillis = new Date().getTimezoneOffset() * 60 * 1000
        const utcEnd = new Date(options.dateTo.getTime() + offsetMillis)
        where.createdAt.$lte = utcEnd
      }
    }

    const [giros, total] = await DI.giros.findAndCount(where, {
      limit,
      offset,
      orderBy: { createdAt: 'DESC' },
      populate: ['minorista', 'minorista.user', 'transferencista', 'transferencista.user', 'rateApplied', 'createdBy'],
    })

    return {
      giros,
      total,
      page,
      limit,
    }
  }

  /**
   * Obtiene un giro por ID con validación de permisos
   */
  async getGiroById(
    giroId: string,
    userId: string,
    userRole: UserRole
  ): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'UNAUTHORIZED' }> {
    const giroRepo = DI.em.getRepository(Giro)

    const giro = await giroRepo.findOne(
      { id: giroId },
      {
        populate: [
          'minorista',
          'minorista.user',
          'transferencista',
          'transferencista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    // Validar permisos según rol
    if (userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN) {
      // Admin y SuperAdmin pueden ver todos los giros
      return giro
    } else if (userRole === UserRole.TRANSFERENCISTA) {
      // Transferencista solo puede ver giros asignados a él
      if (giro.transferencista?.user.id !== userId) {
        return { error: 'UNAUTHORIZED' }
      }
      return giro
    } else if (userRole === UserRole.MINORISTA) {
      // Minorista solo puede ver sus propios giros
      if (giro.minorista?.user.id !== userId) {
        return { error: 'UNAUTHORIZED' }
      }
      return giro
    }

    return { error: 'UNAUTHORIZED' }
  }

  /**
   * Crea un giro de tipo RECARGA
   * Solo MINORISTA puede crear recargas
   */
  async createRecharge(
    data: {
      operatorId: string
      amountBsId: string
      phone: string
      contactoEnvia: string
    },
    createdBy: User,
    exchangeRate: any
  ): Promise<
    | Giro
    | {
        error:
          | 'MINORISTA_NOT_FOUND'
          | 'NO_TRANSFERENCISTA_ASSIGNED'
          | 'INSUFFICIENT_BALANCE'
          | 'OPERATOR_NOT_FOUND'
          | 'AMOUNT_NOT_FOUND'
      }
  > {
    const giroRepo = DI.em.getRepository(Giro)

    // Validar que sea minorista
    if (createdBy.role !== UserRole.MINORISTA) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Obtener minorista
    const minorista = await DI.minoristas.findOne({ user: createdBy.id }, { populate: ['user'] })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Obtener operador
    const operator = await DI.rechargeOperators.findOne({ id: data.operatorId })
    if (!operator) {
      return { error: 'OPERATOR_NOT_FOUND' }
    }

    // Obtener monto
    const amount = await DI.rechargeAmounts.findOne({ id: data.amountBsId })
    if (!amount) {
      return { error: 'AMOUNT_NOT_FOUND' }
    }

    // Asignar transferencista
    const assigned = await this.findNextAvailableTransferencista()
    if (!assigned) {
      return { error: 'NO_TRANSFERENCISTA_ASSIGNED' }
    }

    // Calcular conversiones
    const amountBs = amount.amountBs
    const amountCop = amountBs * Number(exchangeRate.sellRate)

    // Crear transacción de descuento del balance del minorista
    const transactionResult = await minoristaTransactionService.createTransaction({
      minoristaId: minorista.id,
      amount: amountCop,
      type: MinoristaTransactionType.DISCOUNT,
      createdBy,
    })

    if ('error' in transactionResult) {
      return { error: 'INSUFFICIENT_BALANCE' }
    }

    // Recargar minorista para obtener balance actualizado
    await DI.em.refresh(minorista)

    // Calcular ganancias: 5% para minorista
    const minoristaProfit = amountCop * 0.05
    const systemProfit = amountCop * 0.05 // 5% para el sistema

    // Crear transacción de ganancia para el minorista
    await minoristaTransactionService.createTransaction({
      minoristaId: minorista.id,
      amount: minoristaProfit,
      type: MinoristaTransactionType.PROFIT,
      createdBy,
    })

    // Recargar minorista para obtener balance actualizado
    await DI.em.refresh(minorista)

    // Crear giro
    const giro = giroRepo.create({
      minorista,
      transferencista: assigned,
      beneficiaryName: data.contactoEnvia,
      beneficiaryId: data.phone, // Usar teléfono como ID temporal
      bankName: operator.name, // Nombre del operador
      accountNumber: data.phone,
      phone: data.phone,
      rateApplied: exchangeRate,
      amountInput: amountCop,
      currencyInput: 'COP' as any, // COP es el tipo de moneda para recarga
      amountBs: amountBs,
      bcvValueApplied: exchangeRate.bcv,
      systemProfit,
      minoristaProfit,
      executionType: ExecutionType.RECARGA,
      status: GiroStatus.ASIGNADO,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(giro)

    return giro
  }

  /**
   * Crea un giro de tipo PAGO_MOVIL
   * Solo MINORISTA puede crear pagos móviles
   */
  async createMobilePayment(
    data: {
      cedula: string
      bankId: string
      phone: string
      contactoEnvia: string
      amountCop: number
    },
    createdBy: User,
    exchangeRate: any
  ): Promise<
    | Giro
    | {
        error: 'MINORISTA_NOT_FOUND' | 'NO_TRANSFERENCISTA_ASSIGNED' | 'INSUFFICIENT_BALANCE' | 'BANK_NOT_FOUND'
      }
  > {
    const giroRepo = DI.em.getRepository(Giro)

    // Validar que sea minorista
    if (createdBy.role !== UserRole.MINORISTA) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Obtener minorista
    const minorista = await DI.minoristas.findOne({ user: createdBy.id }, { populate: ['user'] })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    // Obtener banco
    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    // Asignar transferencista
    const assigned = await this.findNextAvailableTransferencista()
    if (!assigned) {
      return { error: 'NO_TRANSFERENCISTA_ASSIGNED' }
    }

    // Calcular conversión COP a Bs
    const amountBs = data.amountCop / Number(exchangeRate.sellRate)

    // Crear transacción de descuento del balance del minorista
    const transactionResult = await minoristaTransactionService.createTransaction({
      minoristaId: minorista.id,
      amount: data.amountCop,
      type: MinoristaTransactionType.DISCOUNT,
      createdBy,
    })

    if ('error' in transactionResult) {
      return { error: 'INSUFFICIENT_BALANCE' }
    }

    // Recargar minorista para obtener balance actualizado
    await DI.em.refresh(minorista)

    // Calcular ganancias: 5% para minorista
    const minoristaProfit = data.amountCop * 0.05
    const systemProfit = data.amountCop * 0.05 // 5% para el sistema

    // Crear transacción de ganancia para el minorista
    await minoristaTransactionService.createTransaction({
      minoristaId: minorista.id,
      amount: minoristaProfit,
      type: MinoristaTransactionType.PROFIT,
      createdBy,
    })

    // Recargar minorista para obtener balance actualizado
    await DI.em.refresh(minorista)

    // Crear giro
    const giro = giroRepo.create({
      minorista,
      transferencista: assigned,
      beneficiaryName: data.contactoEnvia,
      beneficiaryId: data.cedula,
      bankName: bank.name,
      accountNumber: data.phone,
      phone: data.phone,
      rateApplied: exchangeRate,
      amountInput: data.amountCop,
      currencyInput: 'COP' as any,
      amountBs: amountBs,
      bcvValueApplied: exchangeRate.bcv,
      systemProfit,
      minoristaProfit,
      executionType: ExecutionType.PAGO_MOVIL,
      status: GiroStatus.ASIGNADO,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(giro)

    // Guardar sugerencia de beneficiario después de la transacción exitosa
    try {
      await beneficiarySuggestionService.saveBeneficiarySuggestion(createdBy.id, {
        beneficiaryName: data.phone, // Para pago móvil, usar teléfono como nombre
        beneficiaryId: data.cedula,
        phone: data.phone,
        bankId: data.bankId,
        accountNumber: data.phone, // Para pago móvil, usar teléfono como account number
        executionType: ExecutionType.PAGO_MOVIL,
      })
    } catch (error) {
      // No fallar si no se puede guardar la sugerencia
      console.warn('Error al guardar sugerencia de beneficiario:', error)
    }

    return giro
  }

  async updateGiro(
    giroId: string,
    data: {
      beneficiaryName: string
      beneficiaryId: string
      bankId: string
      accountNumber: string
      phone: string
    }
  ): Promise<Giro> {
    const giroRepo = DI.em.getRepository(Giro)

    const giro = await giroRepo.findOne(
      { id: giroId },
      {
        populate: [
          'minorista',
          'minorista.user',
          'transferencista',
          'transferencista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )
    if (!giro) {
      throw new Error('Giro no encontrado')
    }

    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      throw new Error('Banco no encontrado')
    }

    if (giro.status === GiroStatus.DEVUELTO) {
      giro.status = GiroStatus.ASIGNADO
    }

    giro.beneficiaryName = data.beneficiaryName
    giro.beneficiaryId = data.beneficiaryId
    giro.bankName = bank.name
    giro.accountNumber = data.accountNumber
    giro.phone = data.phone
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)
    return giro
  }

  /**
   * Actualiza la tasa aplicada a un giro específico
   * Recalcula amountBs y ganancias
   * NO afecta la tasa global del sistema
   */
  async updateGiroRate(
    giroId: string,
    newRate: { buyRate: number; sellRate: number; usd: number; bcv: number },
    createdBy: User
  ): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
    const giroRepo = DI.em.getRepository(Giro)

    const giro = await giroRepo.findOne(
      { id: giroId },
      {
        populate: [
          'minorista',
          'minorista.user',
          'transferencista',
          'transferencista.user',
          'rateApplied',
          'createdBy',
          'bankAccountUsed',
          'bankAccountUsed.bank',
        ],
      }
    )

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    // Solo giros en estado PENDIENTE o ASIGNADO pueden tener su tasa modificada
    if (giro.status !== GiroStatus.ASIGNADO && giro.status !== GiroStatus.PENDIENTE) {
      return { error: 'INVALID_STATUS' }
    }

    // Crear una nueva ExchangeRate personalizada solo para este giro
    const customExchangeRate = await exchangeRateService.createExchangeRate({
      buyRate: newRate.buyRate,
      sellRate: newRate.sellRate,
      usd: newRate.usd,
      bcv: newRate.bcv,
      createdBy,
      isCustom: true,
    })

    // Recalcular amountBs basado en la nueva tasa y currencyInput original
    let newAmountBs: number
    if (giro.currencyInput === Currency.USD) {
      newAmountBs = giro.amountInput * newRate.bcv
    } else if (giro.currencyInput === Currency.COP) {
      newAmountBs = giro.amountInput / newRate.sellRate
    } else {
      // VES (directo)
      newAmountBs = giro.amountInput
    }

    // Recalcular ganancias totales
    const newTotalProfit = giro.amountInput - (giro.amountInput / newRate.sellRate) * newRate.buyRate

    let newSystemProfit = 0
    let newMinoristaProfit = 0

    if (giro.minorista) {
      // Minorista: 5% para él, resto para el sistema
      newMinoristaProfit = giro.amountInput * 0.05
      newSystemProfit = newTotalProfit - newMinoristaProfit
    } else {
      // Admin/SuperAdmin: 100% para el sistema
      newSystemProfit = newTotalProfit
      newMinoristaProfit = 0
    }

    // Actualizar el giro con los nuevos valores
    giro.rateApplied = customExchangeRate
    giro.amountBs = newAmountBs
    giro.bcvValueApplied = newRate.bcv
    giro.systemProfit = newSystemProfit
    giro.minoristaProfit = newMinoristaProfit
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    return giro
  }

  /**
   * Elimina un giro (solo minoristas pueden eliminar sus propios giros)
   * Solo se pueden eliminar giros en estado PENDIENTE o ASIGNADO
   */
  async deleteGiro(
    giroId: string
  ): Promise<{ success: boolean } | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' | 'UNAUTHORIZED' }> {
    const giro = await DI.giros.findOne({ id: giroId }, { populate: ['minorista'] })

    if (!giro) {
      return { error: 'GIRO_NOT_FOUND' }
    }

    // Solo se pueden eliminar giros en estado PENDIENTE, ASIGNADO o DEVUELTO
    if (
      giro.status !== GiroStatus.PENDIENTE &&
      giro.status !== GiroStatus.ASIGNADO &&
      giro.status !== GiroStatus.DEVUELTO
    ) {
      return { error: 'INVALID_STATUS' }
    }

    // Si hay minorista, revertir sus transacciones
    if (giro.minorista) {
      // Obtener todas las transacciones del minorista relacionadas con este giro
      const transactions = await DI.minoristaTransactions.find(
        { giro: giroId },
        { populate: ['minorista'] }
      )

      // Recalcular el balance del minorista revirtiendo las transacciones en orden inverso
      for (const transaction of transactions.reverse()) {
        const minorista = transaction.minorista as any
        const previousAvailable = transaction.previousAvailableCredit || 0
        const previousBalance = transaction.previousBalanceInFavor || 0

        // Revertir el balance al estado anterior
        minorista.availableCredit = previousAvailable
        minorista.creditBalance = previousBalance

        // Persistir cambios del minorista
        await DI.em.persistAndFlush(minorista)

        // Eliminar la transacción
        await DI.em.removeAndFlush(transaction)
      }
    }

    // Eliminar el giro
    await DI.em.removeAndFlush(giro)

    return { success: true }
  }
}

export const giroService = new GiroService()
