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

export class GiroService {
  /**
   * Encuentra el transferencista asignado para un banco destino específico
   */
  private async findAssignedTransferencista(bankId: string): Promise<Transferencista | null> {
    const assignment = await DI.bankAssignments.findOne(
      {
        bank: bankId,
        isActive: true,
      },
      {
        populate: ['transferencista', 'transferencista.user'],
        orderBy: { priority: 'DESC' },
      }
    )

    if (!assignment) return null

    // Verificar que el transferencista esté disponible
    if (!assignment.transferencista.available) {
      // Buscar otro transferencista activo para este banco
      const alternativeAssignment = await DI.bankAssignments.findOne(
        {
          bank: bankId,
          isActive: true,
          transferencista: { available: true },
        },
        {
          populate: ['transferencista', 'transferencista.user'],
          orderBy: { priority: 'DESC' },
        }
      )
      return alternativeAssignment?.transferencista || null
    }

    return assignment.transferencista
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
    let status = GiroStatus.ASIGNADO // Por defecto ASIGNADO cuando hay transferencista
    const entitiesToFlush: (Giro | Minorista)[] = []

    // Asignar transferencista basado en banco destino (para todos los roles)
    const assigned = await this.findAssignedTransferencista(data.bankId)
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
        amount: data.amountBs,
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
    const totalProfit =  data.amountInput - ((data.amountInput / data.rateApplied.sellRate) * data.rateApplied.buyRate) 
    console.log("🚀 ~ GiroService ~ createGiro ~ data.rateApplied.buyRate:", data.rateApplied.buyRate)
    console.log("🚀 ~ GiroService ~ createGiro ~ data.rateApplied.sellRate:", data.rateApplied.sellRate)
    console.log("🚀 ~ GiroService ~ createGiro ~ data.amountInput:", data.amountInput)
    // const totalProfit = (data.rateApplied.sellRate - data.rateApplied.buyRate) * (data.amountInput )
    let systemProfit = 0
    let minoristaProfit = 0

    if (createdBy.role === UserRole.MINORISTA && minorista) {
      // Minorista: 50% para él, 50% para el sistema
      minoristaProfit = totalProfit * 0.5
      systemProfit = totalProfit * 0.5

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
      systemProfit,
      minoristaProfit,
      status,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

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
}

export const giroService = new GiroService()
