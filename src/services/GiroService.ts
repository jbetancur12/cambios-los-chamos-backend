import { DI } from '@/di'
import { Giro, GiroStatus, ExecutionType } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { CreateGiroInput } from '@/types/giro'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'
import { MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { bankAccountTransactionService } from '@/services/BankAccountTransactionService'
import { BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { sendGiroAssignedNotification } from '@/lib/notification_sender'

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
    const giroRepo = DI.em.getRepository(Giro)

    // Verificar que el banco destino exista
    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    let minorista: Minorista | undefined = undefined
    let transferencista: Transferencista | undefined = undefined
    const status = GiroStatus.ASIGNADO // Por defecto ASIGNADO cuando hay transferencista
    const entitiesToFlush: (Giro | Minorista)[] = []

    // Asignar transferencista usando round-robin (distribución equitativa)
    const assigned = await this.findNextAvailableTransferencista()
    if (!assigned) {
      return { error: 'NO_TRANSFERENCISTA_ASSIGNED' }
    }
    transferencista = assigned

    // Determinar origen del saldo según rol del creador
    if (createdBy.role === UserRole.MINORISTA) {
      // Minorista: requiere minoristaId, verificar y descontar su balance
      if (!data.minoristaId) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }

      const minoristaRepo = DI.em.getRepository(Minorista)
      const foundMinorista = await minoristaRepo.findOne({ id: data.minoristaId }, { populate: ['user'] })

      if (!foundMinorista) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }

      // Crear transacción de descuento del balance del minorista
      const transactionResult = await minoristaTransactionService.createTransaction({
        minoristaId: foundMinorista.id,
        amount: data.amountInput,
        type: MinoristaTransactionType.DISCOUNT,
        createdBy,
      })

      if ('error' in transactionResult) {
        return { error: 'INSUFFICIENT_BALANCE' }
      }

      // Recargar minorista para obtener balance actualizado
      await DI.em.refresh(foundMinorista)
      minorista = foundMinorista
    }
    // Admin/SuperAdmin: NO requiere minorista
    // El dinero se descontará de la cuenta del transferencista cuando ejecute el giro

    // Calcular ganancias: ((monto / sellRate) * buyRate) - monto
    const totalProfit = data.amountInput - (data.amountInput / data.rateApplied.sellRate) * data.rateApplied.buyRate

    // const totalProfit = (data.rateApplied.sellRate - data.rateApplied.buyRate) * (data.amountInput )
    let systemProfit = 0
    let minoristaProfit = 0

    if (createdBy.role === UserRole.MINORISTA && minorista) {
      // Minorista: 50% para él, 50% para el sistema
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
        // Si falla la transacción de ganancia, no debería pasar pero manejamos el error
        console.error('Error al crear transacción de ganancia:', profitTransaction.error)
      } else {
        // Recargar minorista para obtener balance actualizado
        await DI.em.refresh(minorista)
      }
    } else {
      // Admin/SuperAdmin: 100% para el sistema
      systemProfit = totalProfit
      minoristaProfit = 0
    }

    // Crear giro
    const giro = giroRepo.create({
      minorista, // Puede ser undefined para admin/superadmin
      transferencista,
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
      status,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await sendGiroAssignedNotification(transferencista.user.id, giro.id, giro.amountBs)

    entitiesToFlush.push(giro)
    await DI.em.persistAndFlush(entitiesToFlush)

    return giro
  }

  /**
   * Ejecuta un giro. El transferencista selecciona cuenta y tipo de ejecución.
   * Valida balance y descuenta de la cuenta del transferencista.
   */
  async executeGiro(
    giroId: string,
    bankAccountId: string,
    executionType: ExecutionType,
    fee: number,
    proofUrl?: string
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
    const giro = await DI.giros.findOne({ id: giroId }, { populate: ['transferencista', 'minorista'] })

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

    // Actualizar giro
    giro.bankAccountUsed = bankAccount
    giro.executionType = executionType
    giro.status = GiroStatus.COMPLETADO
    if (proofUrl) {
      giro.proofUrl = proofUrl
    }
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    return giro
  }

  async returnGiro(giroId: string, reason: string): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
    const giro = await DI.giros.findOne({ id: giroId }, { populate: ['minorista'] })

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
    const giro = await DI.giros.findOne({ id: giroId })

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
        where.createdAt.$gte = options.dateFrom
      }
      if (options.dateTo) {
        where.createdAt.$lte = options.dateTo
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
    const giro = await DI.giros.findOne({ id: giroId })
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
}

export const giroService = new GiroService()
