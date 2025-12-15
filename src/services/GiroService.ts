import { DI } from '@/di'
import { Giro, GiroStatus, ExecutionType } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { CreateGiroInput } from '@/types/giro'
import { User, UserRole } from '@/entities/User'
import { Transferencista } from '@/entities/Transferencista'
import { minoristaTransactionService } from '@/services/MinoristaTransactionService'
import {
  MinoristaTransaction,
  MinoristaTransactionType,
  MinoristaTransactionStatus,
} from '@/entities/MinoristaTransaction'
import { bankAccountTransactionService } from '@/services/BankAccountTransactionService'
import { BankAccountTransactionType } from '@/entities/BankAccountTransaction'
import { sendGiroAssignedNotification } from '@/lib/notification_sender'
import { exchangeRateService } from '@/services/ExchangeRateService'
import { beneficiarySuggestionService } from '@/services/BeneficiarySuggestionService'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { Currency } from '@/entities/Bank'
import { EntityManager, LockMode, FilterQuery } from '@mikro-orm/core'
import { TransferencistaAssignmentTracker } from '@/entities/TransferencistaAssignmentTracker'
import { sendEmail } from '@/lib/emailUtils'
import { notificationService } from '@/services/NotificationService'

export class GiroService {
  /**
   * Encuentra el siguiente transferencista disponible usando distribución round-robin
   * Distribuye los giros equitativamente entre TODOS los transferencistas disponibles
   * REQUIRES an active transaction EntityManager for locking
   */
  private async findNextAvailableTransferencista(em: EntityManager): Promise<Transferencista | null> {
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

    // Obtener o crear el tracker de asignación con PESSIMISTIC_WRITE lock
    // Esto asegura que solo una transacción pueda leer/escribir el tracker a la vez
    let tracker = await em.findOne(
      TransferencistaAssignmentTracker,
      { id: 1 },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    )

    if (!tracker) {
      // Si no existe, intentar crearlo.
      // Nota: En alta concurrencia, esto podría fallar si otro proceso lo crea al mismo tiempo,
      // pero debería ser un evento único al inicio del sistema.
      try {
        tracker = em.create(TransferencistaAssignmentTracker, {
          id: 1,
          lastAssignedIndex: 0,
          updatedAt: new Date(),
        })
        await em.persistAndFlush(tracker)
        // Volver a adquirir lock después de crear
        await em.refresh(tracker, { lockMode: LockMode.PESSIMISTIC_WRITE })
      } catch {
        // Si falla por duplicado, intentar leerlo de nuevo con lock
        tracker = await em.findOne(
          TransferencistaAssignmentTracker,
          { id: 1 },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        )
      }
    }

    if (!tracker) {
      // Fallback extremo si no se pudo obtener ni crear
      return availableTransferencistas[0]
    }

    // Calcular el siguiente índice (round-robin)
    const nextIndex = (tracker.lastAssignedIndex + 1) % availableTransferencistas.length
    const selectedTransferencista = availableTransferencistas[nextIndex]

    // Actualizar el tracker
    tracker.lastAssignedIndex = nextIndex
    tracker.updatedAt = new Date()
    await em.persist(tracker)

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

    // VALIDACIÓN 2: Si es minorista, verificar que exista y tenga balance suficiente
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
    return await DI.em
      .transactional(async (em) => {
        // ASIGNACIÓN DE TRANSFERENCISTA (DENTRO DE LA TRANSACCIÓN)
        const assigned = await this.findNextAvailableTransferencista(em)
        if (!assigned) {
          // Si no hay transferencista, lanzamos error para abortar la transacción
          throw new Error('NO_TRANSFERENCISTA_ASSIGNED')
        }

        const giroRepo = em.getRepository(Giro)

        // Descontar balance del minorista si aplica
        if (createdBy.role === UserRole.MINORISTA && minorista) {
          // Crear transacción de descuento del balance del minorista
          const transactionResult = await minoristaTransactionService.createTransaction(
            {
              minoristaId: minorista.id,
              amount: data.amountInput,
              type: MinoristaTransactionType.DISCOUNT,
              status: MinoristaTransactionStatus.PENDING, // Transacción en 'Hold' hasta que se complete el giro
              createdBy,
            },
            em
          ) // Pasar EM transaccional

          if ('error' in transactionResult) {
            throw new Error('INSUFFICIENT_BALANCE')
          }

          // Recargar minorista para obtener balance actualizado
          // await em.refresh(minorista) // COMENTADO: Esto descartaba los cambios hechos por createTransaction
        }

        // Calcular ganancias: ((monto / sellRate) * buyRate) - monto
        const totalProfit = data.amountInput - (data.amountInput / data.rateApplied.sellRate) * data.rateApplied.buyRate

        let systemProfit = 0
        let minoristaProfit = 0

        if (createdBy.role === UserRole.MINORISTA && minorista) {
          // Minorista: Porcentaje configurado para él (default 5%), resto para el sistema
          minoristaProfit = data.amountInput * minorista.profitPercentage
          systemProfit = totalProfit - minoristaProfit
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
          bankCode: bank.code,
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
          // Find transactions created within 1 second of giro creation (more reliable than limit 2)
          const giroCreatedTime = giro.createdAt.getTime()
          const minoristaTransactions = await transactionRepo.find(
            {
              minorista: minorista.id,
              giro: { $eq: null }, // Transacciones sin giro vinculado
              type: MinoristaTransactionType.DISCOUNT,
              // Buscar transacciones creadas en el mismo moment que el giro (±1 segundo)
              createdAt: {
                $gte: new Date(giroCreatedTime - 1000),
                $lte: new Date(giroCreatedTime + 1000),
              },
            },
            { orderBy: { createdAt: 'ASC' as const } }
          )

          // Vincular las transacciones a este giro
          for (const transaction of minoristaTransactions) {
            ; (transaction as MinoristaTransaction).giro = giro
            em.persist(transaction)
          }
          await em.flush()
        }

        // Enviar notificación después de que la transacción se complete exitosamente
        // NOTA: Esto es side-effect, idealmente debería estar fuera, pero necesitamos los datos del giro
        // Se ejecutará solo si el commit es exitoso si usamos afterCommit hooks, pero aquí es directo.
        // Si falla el commit, la notificación se envió (riesgo menor).
        console.log(
          `[GIRO-SERVICE] Intentando enviar notificación al transferencista ${assigned.user.id} para giro ${giro.id}`
        )
        await sendGiroAssignedNotification(assigned.user.id, giro.id, giro.amountBs, giro.executionType)
        console.log(`[GIRO-SERVICE] Notificación enviada (o proceso completado) para giro ${giro.id}`)

        // Enviar correo electrónico al transferencista
        try {
          const emailSubject = `Nuevo Giro Asignado (${giro.executionType}) - ${giro.amountBs.toFixed(2)} Bs`
          const emailBody = `
            <h1>Nuevo Giro Asignado</h1>
            <p>Se te ha asignado un nuevo giro (${giro.executionType}) para procesar.</p>
            <ul>
              <li><strong>Monto:</strong> ${giro.amountBs.toFixed(2)} Bs</li>
              <li><strong>Banco:</strong> ${bank.name}</li>
              <li><strong>Cuenta:</strong> ${giro.accountNumber}</li>
              <li><strong>Beneficiario:</strong> ${giro.beneficiaryName}</li>
              <li><strong>Generado por:</strong> ${createdBy.fullName || createdBy.email}</li>
              <li><strong>ID Giro:</strong> ${giro.id}</li>
              <li><strong>Tipo:</strong> ${giro.executionType}</li>
            </ul>
            <p>Por favor, ingresa a la plataforma para procesarlo.</p>
          `

          // Asumimos que el usuario del transferencista tiene email
          if (assigned.user.email) {
            const { error } = await sendEmail(assigned.user.email, emailSubject, emailBody)
            if (error) {
              console.error(`[EMAIL] Falló envío a ${assigned.user.email}:`, error)
            } else {
              console.info(`[EMAIL] Enviado correctamente a ${assigned.user.email} (Giro: ${giro.id})`)
            }
          } else {
            console.warn(`[EMAIL] Transferencista ${assigned.id} no tiene email configurado.`)
          }
        } catch (emailError) {
          console.error('[EMAIL] Error al enviar correo de notificación:', emailError)
          // No lanzamos error para no revertir la transacción del giro
        }

        return giro
      })
      .then(async (giro) => {
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
      })
      .catch((error) => {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          return { error: 'INSUFFICIENT_BALANCE' as const }
        }
        if (error.message === 'NO_TRANSFERENCISTA_ASSIGNED') {
          return { error: 'NO_TRANSFERENCISTA_ASSIGNED' as const }
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
    fee: number,
    executingUser?: User
  ): Promise<
    | Giro
    | {
      error:
      | 'GIRO_NOT_FOUND'
      | 'INVALID_STATUS'
      | 'BANK_ACCOUNT_NOT_FOUND'
      | 'INSUFFICIENT_BALANCE'
      | 'UNAUTHORIZED_ACCOUNT'
      | 'BANK_NOT_ASSIGNED_TO_TRANSFERENCISTA'
    }
  > {
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

    const bankAccount = await DI.bankAccounts.findOne(
      { id: bankAccountId },
      { populate: ['transferencista', 'bank', 'bank'] }
    )

    if (!bankAccount) {
      return { error: 'BANK_ACCOUNT_NOT_FOUND' }
    }

    // ✨ NUEVA VALIDACIÓN: Si se proporciona el usuario ejecutor, validar permisos
    if (executingUser) {
      const { canExecuteGiroWithAccount } = await import('@/lib/bankAccountPermissions')

      if (!canExecuteGiroWithAccount(bankAccount, executingUser)) {
        return { error: 'UNAUTHORIZED_ACCOUNT' }
      }

      // Si es transferencista, validar asignación de banco
      // if (executingUser.role === UserRole.TRANSFERENCISTA) {
      //   const transferencista = await DI.transferencistas.findOne({
      //     user: executingUser.id,
      //   })

      //   const hasAssignment = await DI.bankAssignments.findOne({
      //     bank: bankAccount.bank.id,
      //     transferencista: transferencista!.id,
      //     isActive: true,
      //   })

      //   if (!hasAssignment) {
      //     return { error: 'BANK_NOT_ASSIGNED_TO_TRANSFERENCISTA' }
      //   }
      // }
    } else {
      // Validación antigua para compatibilidad (si no se pasa usuario)
      // Verificar que la cuenta pertenezca al transferencista del giro
      if (giro.transferencista?.id !== bankAccount.transferencista?.id) {
        return { error: 'UNAUTHORIZED_ACCOUNT' }
      }
    }

    // Crear transacción de retiro de la cuenta bancaria
    const createdByUser = executingUser || giro.transferencista?.user
    if (!createdByUser) {
      return { error: 'UNAUTHORIZED_ACCOUNT' }
    }

    const transactionResult = await bankAccountTransactionService.createTransaction({
      bankAccountId: bankAccount.id,
      amount: giro.amountBs,
      fee,
      type: BankAccountTransactionType.WITHDRAWAL,
      reference: `Giro ${giro.id}`,
      createdBy: createdByUser,
      allowOverdraft: true,
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
    giro.commission = fee
    giro.executedBy = executingUser || giro.transferencista?.user
    giro.completedAt = new Date()
    giro.updatedAt = new Date()

    await DI.em.persistAndFlush(giro)

    // ✨ ACTUALIZAR TRANSACCIÓN DE MINORISTA A COMPLETADO (COMMIT)
    if (giro.minorista) {
      const transactionRepo = DI.em.getRepository(MinoristaTransaction)
      // Buscar la transacción asociada al giro
      // Nota: En createGiro vinculamos la transacción al giro.
      const transaction = await transactionRepo.findOne({ giro: giro.id })

      if (transaction && transaction.status === MinoristaTransactionStatus.PENDING) {
        // Actualizar a completado para que sea visible en el historial
        // No afecta el balance (ya se descontó en createGiro)
        // Actualizar a completado para que sea visible en el historial
        // Usamos el servicio para asegurar que se emita el evento de WebSocket
        await minoristaTransactionService.updateTransactionStatus(
          transaction.id,
          MinoristaTransactionStatus.COMPLETED,
          DI.em
        )
      }
    }

    // Enviar correo al creador del giro - DESHABILITADO POR SOLICITUD DEL USUARIO
    /*
    try {
      if (giro.createdBy && giro.createdBy.email) {
        const emailSubject = `Giro Completado - ${giro.amountBs.toFixed(2)} Bs`
        const emailBody = `
          <h1>Giro Completado</h1>
          <p>El giro por <strong>${giro.amountBs.toFixed(2)} Bs</strong> ha sido completado exitosamente.</p>
          <ul>
            <li><strong>ID Giro:</strong> ${giro.id}</li>
            <li><strong>Beneficiario:</strong> ${giro.beneficiaryName}</li>
            <li><strong>Banco:</strong> ${giro.bankName}</li>
            <li><strong>Cuenta:</strong> ${giro.accountNumber}</li>
            <li><strong>Ejecutado por:</strong> ${executingUser?.fullName || giro.transferencista?.user.fullName || 'Transferencista'}</li>
          </ul>
        `
        await sendEmail(giro.createdBy.email, emailSubject, emailBody)
      }
    } catch (emailError) {
      console.error('[EMAIL] Error al enviar correo de completado:', emailError)
    }
    */

    return giro
  }

  async returnGiro(
    giroId: string,
    reason: string,
    createdBy: User
  ): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'INVALID_STATUS' }> {
    try {
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
        console.warn(`[GIRO] Return failed: GIRO_NOT_FOUND (giroId: ${giroId}, user: ${createdBy.id})`)
        return { error: 'GIRO_NOT_FOUND' }
      }

      // Solo giros ASIGNADOS o PROCESANDO pueden ser devueltos
      if (giro.status !== GiroStatus.ASIGNADO && giro.status !== GiroStatus.PROCESANDO) {
        console.warn(
          `[GIRO] Return failed: INVALID_STATUS (giroId: ${giroId}, status: ${giro.status}, user: ${createdBy.id})`
        )
        return { error: 'INVALID_STATUS' }
      }

      // Procesar dentro de una transacción para asegurar consistencia
      return await DI.em.transactional(async (em) => {
        console.info(`[GIRO] Starting return process (giroId: ${giroId}, reason: ${reason})`)

        giro.status = GiroStatus.DEVUELTO
        giro.returnReason = reason
        giro.updatedAt = new Date()

        // Si el giro tiene minorista, reembolsar el monto
        if (giro.minorista) {
          console.info(
            `[GIRO] Processing refund for minorista (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, amount: ${giro.amountInput})`
          )

          const transactionRepo = em.getRepository(MinoristaTransaction)
          const originalTransaction = await transactionRepo.findOne({ giro: giro.id })

          let refundResult

          if (originalTransaction && originalTransaction.status === MinoristaTransactionStatus.PENDING) {
            // Si estaba PENDING (no visible), refund invisible (CANCELLED)
            refundResult = await minoristaTransactionService.createTransaction(
              {
                minoristaId: giro.minorista.id,
                amount: giro.amountInput,
                type: MinoristaTransactionType.REFUND,
                status: MinoristaTransactionStatus.CANCELLED,
                createdBy,
              },
              em
            )

            if ('error' in refundResult) throw new Error('Error al reembolsar minorista')

            originalTransaction.status = MinoristaTransactionStatus.CANCELLED
            em.persist(originalTransaction)
          } else {
            // Si ya estaba COMPLETED, refund visible
            refundResult = await minoristaTransactionService.createTransaction(
              {
                minoristaId: giro.minorista.id,
                amount: giro.amountInput,
                type: MinoristaTransactionType.REFUND,
                status: MinoristaTransactionStatus.COMPLETED,
                createdBy,
              },
              em
            )

            // Vincular transacción al giro
            if (!('error' in refundResult)) {
              refundResult.giro = giro
              em.persist(refundResult)
            }
          }

          if ('error' in refundResult) {
            console.error(
              `[GIRO] Refund failed (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, error: ${refundResult.error})`
            )
            throw new Error('Error al reembolsar minorista')
          }
          console.info(`[GIRO] Refund successful (giroId: ${giroId}, minoristaId: ${giro.minorista.id})`)
        }

        em.persist(giro)
        await em.flush()

        console.info(`[GIRO] Return completed successfully (giroId: ${giroId})`)

        // ✨ Enviar notificación push al minorista (Side effect, errorsafe)
        if (giro.minorista && giro.minorista.user) {
          try {
            const title = 'Giro Devuelto'
            const body = `Su giro a ${giro.beneficiaryName} por Bs ${giro.amountBs.toFixed(2)} ha sido devuelto.`
            await notificationService.sendNotificationToUser(giro.minorista.user.id, title, body, {
              giroId: giro.id,
              type: 'REFUND',
            })
          } catch (notifyError) {
            console.error(`[GIRO] Error sending refund notification (giroId: ${giroId}):`, notifyError)
          }
        }

        return giro
      })
    } catch (error) {
      console.error(`[GIRO] Unexpected error during return (giroId: ${giroId}):`, error)
      throw error
    }
  }

  /**
   * Elimina un giro.
   * Solo el usuario que creó el giro puede eliminarlo.
   * Solo en estados PENDIENTE, ASIGNADO o DEVUELTO.
   * Reembolsa el monto al minorista antes de eliminar.
   */
  async deleteGiro(
    giroId: string,
    user: User
  ): Promise<Giro | { error: 'GIRO_NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATUS' }> {
    try {
      const giro = await DI.em.getRepository(Giro).findOne({ id: giroId }, { populate: ['minorista', 'createdBy'] })

      if (!giro) {
        console.warn(`[GIRO] Delete failed: GIRO_NOT_FOUND (giroId: ${giroId}, user: ${user.id})`)
        return { error: 'GIRO_NOT_FOUND' }
      }

      // Permisos de eliminación:
      // 1. El creador del giro siempre puede eliminarlo (si el estado lo permite)
      // 2. ADMIN/SUPER_ADMIN pueden eliminar giros en estado DEVUELTO
      const isCreator = giro.createdBy?.id === user.id
      const isAdminDeletingReturned =
        (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) && giro.status === GiroStatus.DEVUELTO

      if (!isCreator && !isAdminDeletingReturned) {
        console.warn(
          `[GIRO] Delete failed: FORBIDDEN (giroId: ${giroId}, user: ${user.id}, role: ${user.role}, status: ${giro.status})`
        )
        return { error: 'FORBIDDEN' }
      }

      // Solo ciertos estados permitidos
      if (![GiroStatus.PENDIENTE, GiroStatus.ASIGNADO, GiroStatus.DEVUELTO].includes(giro.status)) {
        console.warn(`[GIRO] Delete failed: INVALID_STATUS (giroId: ${giroId}, status: ${giro.status})`)
        return { error: 'INVALID_STATUS' }
      }

      // Procesar dentro de una transacción
      return await DI.em.transactional(async (em) => {
        console.info(`[GIRO] Starting delete process (giroId: ${giroId}, minoristaId: ${giro.minorista?.id})`)

        if (giro.minorista && giro.status !== GiroStatus.DEVUELTO) {
          console.info(
            `[GIRO] Processing refund for cancelled giro (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, amount: ${giro.amountInput})`
          )

          // Crear REFUND visible siempre, para mantener trazabilidad
          const refundResult = await minoristaTransactionService.createTransaction(
            {
              minoristaId: giro.minorista.id,
              amount: giro.amountInput,
              type: MinoristaTransactionType.REFUND,
              status: MinoristaTransactionStatus.COMPLETED,
              createdBy: user,
              description: `Reembolso por cancelación de giro ${giro.id}`,
              giro: giro, // Vincular al giro cancelado
            },
            em
          )

          if ('error' in refundResult) {
            console.error(
              `[GIRO] Cancel refund failed (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, error: ${refundResult.error})`
            )
            throw new Error('Error al reembolsar minorista')
          }

          console.info(`[GIRO] Cancel refund successful (giroId: ${giroId}, minoristaId: ${giro.minorista.id})`)
        } else if (giro.minorista && giro.status === GiroStatus.DEVUELTO) {
          console.info(`[GIRO] Skipping refund for cancelled giro because it is already RETURNED (giroId: ${giroId})`)
        }

        // Soft Delete: Marcar como CANCELADO en lugar de eliminar
        console.info(`[GIRO] Marking giro as CANCELLED (giroId: ${giroId})`)
        giro.status = GiroStatus.CANCELADO

        em.persist(giro)
        await em.flush()

        console.info(`[GIRO] Cancel completed successfully (giroId: ${giroId})`)
        return giro
      })
    } catch (error) {
      console.error(`[GIRO] Unexpected error during delete (giroId: ${giroId}):`, error)
      throw error
    }
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
    return await DI.em.transactional(async (em) => {
      // Encontrar todos los giros pendientes o en proceso del transferencista
      const pendingGiros = await em.find(Giro, {
        transferencista: transferencistaId,
        status: { $in: [GiroStatus.ASIGNADO, GiroStatus.PROCESANDO] },
      })

      let redistributed = 0
      let errors = 0

      for (const giro of pendingGiros) {
        try {
          // Encontrar nuevo transferencista usando round-robin (con lock)
          const newTransferencista = await this.findNextAvailableTransferencista(em)

          if (!newTransferencista) {
            // No hay transferencistas disponibles, dejar el giro como está
            errors++
            continue
          }

          // Reasignar el giro
          giro.transferencista = newTransferencista
          giro.status = GiroStatus.ASIGNADO // Resetear a ASIGNADO si estaba PROCESANDO
          giro.updatedAt = new Date()

          em.persist(giro)
          redistributed++
        } catch (error) {
          console.error(`Error redistribuyendo giro ${giro.id}:`, error)
          errors++
        }
      }

      // Guardar todos los cambios
      if (pendingGiros.length > 0) {
        await em.flush()
      }

      return { redistributed, errors }
    })
  }

  /**
   * Lista giros con filtros y permisos según rol
   */
  async listGiros(options: {
    userId: string
    userRole: UserRole
    minoristaId?: string
    status?: GiroStatus | GiroStatus[]
    dateFrom?: Date
    dateTo?: Date
    page?: number
    limit?: number
    showAllTraffic?: boolean
  }): Promise<{
    giros: Giro[]
    total: number
    page: number
    limit: number
    totals: {
      count: number
      cop: number
      bs: number
      minoristaProfit: number
      systemProfit: number
      bankCommission: number
    }
  }> {
    const page = options.page ?? 1
    const limit = options.limit ?? 50
    const offset = (page - 1) * limit

    // Construir filtros base según rol
    const where: FilterQuery<Giro> = {}

    if (options.minoristaId) {
      where.minorista = options.minoristaId
    }

    if (options.status) {
      if (Array.isArray(options.status)) {
        where.status = { $in: options.status }
      } else {
        where.status = options.status
      }
    }

    if (options.userRole === UserRole.TRANSFERENCISTA) {
      // Transferencista: solo giros asignados a él
      const transferencista = await DI.transferencistas.findOne({ user: options.userId })
      if (!transferencista) {
        return {
          giros: [],
          total: 0,
          page,
          limit,
          totals: {
            count: 0,
            cop: 0,
            bs: 0,
            minoristaProfit: 0,
            systemProfit: 0,
            bankCommission: 0,
          },
        }
      }
      where.transferencista = transferencista.id
    } else if (options.userRole === UserRole.MINORISTA) {
      // Minorista: solo sus giros
      const minorista = await DI.minoristas.findOne({ user: options.userId })
      if (!minorista) {
        return {
          giros: [],
          total: 0,
          page,
          limit,
          totals: {
            count: 0,
            cop: 0,
            bs: 0,
            minoristaProfit: 0,
            systemProfit: 0,
            bankCommission: 0,
          },
        }
      }
      where.minorista = minorista.id
    }
    // SUPER_ADMIN/ADMIN: ven todos los giros (sin filtro adicional)

    // Filtros opcionales
    if (options.status) {
      where.status = options.status

      // Si el usuario es ADMIN/SUPER_ADMIN y está filtrando por COMPLETADO,
      // Solo mostrar giros creados por el sistema (sin minorista vinculado),
      // es decir, excluir los de minoristas.
      // EXCEPTO si se especifica explicitamente que se quiere ver todo el tráfico (showAllTraffic)
      if (
        (options.userRole === UserRole.ADMIN || options.userRole === UserRole.SUPER_ADMIN) &&
        options.status === GiroStatus.COMPLETADO &&
        !options.showAllTraffic
      ) {
        where.minorista = null
      }
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
      populate: [
        'minorista',
        'minorista.user',
        'transferencista',
        'transferencista.user',
        'rateApplied',
        'createdBy',
        'executedBy',
        'bankAccountUsed',
        'bankAccountUsed.bank',
      ],
    })

    // Calcular totales globales usando Knex query builder subyacente para evitar problemas de quoting de MikroORM
    const qb = DI.em.createQueryBuilder(Giro, 'g')
    qb.where(where)

    const knex = DI.em.getConnection().getKnex()
    const totalsQuery = qb.getKnexQuery()
      .clearSelect()
      .select([
        knex.raw('count(*) as "count"'),
        knex.raw('coalesce(sum(amount_bs), 0) as "total_bs"'),
        knex.raw('coalesce(sum(commission), 0) as "total_commission"'),
        knex.raw('coalesce(sum(system_profit), 0) as "total_system_profit"'),
        knex.raw('coalesce(sum(minorista_profit), 0) as "total_minorista_profit"'),
        knex.raw("coalesce(sum(case when currency_input = 'COP' then amount_input else 0 end), 0) as \"total_cop\""),
      ])

    const totalsResult = await DI.em.getConnection().execute(totalsQuery)
    const t = totalsResult[0] as any

    return {
      giros,
      total,
      page,
      limit,
      totals: {
        count: total,
        cop: parseFloat(t.total_cop || '0'),
        bs: parseFloat(t.total_bs || '0'),
        minoristaProfit: parseFloat(t.total_minorista_profit || '0'),
        systemProfit: parseFloat(t.total_system_profit || '0'),
        bankCommission: parseFloat(t.total_commission || '0'),
      },
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
          'executedBy',
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
   * SUPER_ADMIN, ADMIN, y MINORISTA pueden crear recargas
   */
  async createRecharge(
    data: {
      operatorId: string
      amountBsId: string
      phone: string
      contactoEnvia: string
    },
    createdBy: User,
    exchangeRate: ExchangeRate
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
    // Obtener minorista solo si el usuario es MINORISTA
    let minorista: Minorista | null = null
    if (createdBy.role === UserRole.MINORISTA) {
      minorista = await DI.minoristas.findOne({ user: createdBy.id }, { populate: ['user'] })
      if (!minorista) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }
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

    return await DI.em
      .transactional(async (em) => {
        // Asignar transferencista (dentro de transacción con lock)
        const assigned = await this.findNextAvailableTransferencista(em)
        if (!assigned) {
          throw new Error('NO_TRANSFERENCISTA_ASSIGNED')
        }

        // Calcular conversiones
        const amountBs = amount.amountBs
        const amountCop = amountBs * Number(exchangeRate.sellRate)

        let minoristaTransaction: MinoristaTransaction | null = null

        // Crear transacción de descuento del balance del minorista solo si hay minorista
        if (minorista) {
          const transactionResult = await minoristaTransactionService.createTransaction(
            {
              minoristaId: minorista.id,
              amount: amountCop,
              type: MinoristaTransactionType.DISCOUNT,
              status: MinoristaTransactionStatus.PENDING,
              createdBy,
            },
            em
          )

          if ('error' in transactionResult) {
            throw new Error('INSUFFICIENT_BALANCE')
          }

          minoristaTransaction = transactionResult

          // Recargar minorista para obtener balance actualizado
          // await em.refresh(minorista) // REMOVED: Reverts uncommited changes
        }

        // Calcular ganancias: ((monto / sellRate) * buyRate) - monto
        const totalProfit = amountCop - (amountCop / exchangeRate.sellRate) * exchangeRate.buyRate

        // Calcular ganancias: Porcentaje configurado para minorista (si existe), resto para el sistema
        const minoristaProfit = minorista ? amountCop * minorista.profitPercentage : 0
        const systemProfit = totalProfit - minoristaProfit

        const giroRepo = em.getRepository(Giro)

        // Crear giro
        const giro = giroRepo.create({
          minorista,
          transferencista: assigned,
          beneficiaryName: data.contactoEnvia,
          beneficiaryId: data.phone, // Usar teléfono como ID temporal
          bankName: operator.name, // Nombre del operador
          bankCode: operator.code || 0,
          accountNumber: data.phone,
          phone: data.phone,
          rateApplied: exchangeRate,
          amountInput: amountCop,
          currencyInput: Currency.COP, // COP es el tipo de moneda para recarga
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

        await em.persistAndFlush(giro)

        // Vincular transacción al giro
        if (minoristaTransaction) {
          minoristaTransaction.giro = giro
          em.persist(minoristaTransaction)
          // No need to flush again immediately if using transactional, but secure it
          await em.flush()
        }

        // Enviar notificación (WebSocket)
        console.log(
          `[GIRO-SERVICE] Intentando enviar notificación al transferencista ${assigned.user.id} para giro ${giro.id}`
        )
        await sendGiroAssignedNotification(assigned.user.id, giro.id, giro.amountBs, giro.executionType)
        console.log(`[GIRO-SERVICE] Notificación enviada (o proceso completado) para giro ${giro.id}`)

        // Enviar correo electrónico al transferencista
        try {
          const emailSubject = `Nuevo Giro Asignado (${giro.executionType}) - ${giro.amountBs.toFixed(2)} Bs`
          const emailBody = `
            <h1>Nuevo Giro Asignado</h1>
            <p>Se te ha asignado un nuevo giro (${giro.executionType}) para procesar.</p>
            <ul>
              <li><strong>Monto:</strong> ${giro.amountBs.toFixed(2)} Bs</li>
              <li><strong>Operador:</strong> ${operator.name}</li>
              <li><strong>Teléfono:</strong> ${giro.accountNumber}</li>
              <li><strong>Generado por:</strong> ${createdBy.fullName || createdBy.email}</li>
              <li><strong>ID Giro:</strong> ${giro.id}</li>
              <li><strong>Tipo:</strong> ${giro.executionType}</li>
            </ul>
            <p>Por favor, ingresa a la plataforma para procesarlo.</p>
          `

          // Asumimos que el usuario del transferencista tiene email
          if (assigned.user.email) {
            const { error } = await sendEmail(assigned.user.email, emailSubject, emailBody)
            if (error) {
              console.error(`[EMAIL] Falló envío a ${assigned.user.email}:`, error)
            } else {
              console.info(`[EMAIL] Enviado correctamente a ${assigned.user.email} (Giro: ${giro.id})`)
            }
          } else {
            console.warn(`[EMAIL] Transferencista ${assigned.id} no tiene email configurado.`)
          }
        } catch (emailError) {
          console.error('[EMAIL] Error al enviar correo de notificación:', emailError)
          // No lanzamos error para no revertir la transacción del giro
        }

        return giro
      })
      .catch((error) => {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          return { error: 'INSUFFICIENT_BALANCE' as const }
        }
        if (error.message === 'NO_TRANSFERENCISTA_ASSIGNED') {
          return { error: 'NO_TRANSFERENCISTA_ASSIGNED' as const }
        }
        console.error('Error al crear recarga:', error)
        throw error
      })
  }

  /**
   * Crea un giro de tipo PAGO_MOVIL
   * SUPER_ADMIN, ADMIN, y MINORISTA pueden crear pagos móviles
   */
  async createMobilePayment(
    data: {
      cedula: string
      bankId: string
      phone: string
      contactoEnvia?: string // Made optional
      amountCop: number
    },
    createdBy: User,
    exchangeRate: ExchangeRate
  ): Promise<
    | Giro
    | {
      error: 'MINORISTA_NOT_FOUND' | 'NO_TRANSFERENCISTA_ASSIGNED' | 'INSUFFICIENT_BALANCE' | 'BANK_NOT_FOUND'
    }
  > {
    // Obtener minorista solo si el usuario es MINORISTA
    let minorista: Minorista | null = null
    if (createdBy.role === UserRole.MINORISTA) {
      minorista = await DI.minoristas.findOne({ user: createdBy.id }, { populate: ['user'] })
      if (!minorista) {
        return { error: 'MINORISTA_NOT_FOUND' }
      }
    }

    // Obtener banco
    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      return { error: 'BANK_NOT_FOUND' }
    }

    return await DI.em
      .transactional(async (em) => {
        // Asignar transferencista (dentro de transacción con lock)
        const assigned = await this.findNextAvailableTransferencista(em)
        if (!assigned) {
          throw new Error('NO_TRANSFERENCISTA_ASSIGNED')
        }

        // Calcular conversión COP a Bs
        const amountBs = data.amountCop / Number(exchangeRate.sellRate)

        let minoristaTransaction: MinoristaTransaction | null = null

        // Crear transacción de descuento del balance del minorista solo si hay minorista
        if (minorista) {
          const transactionResult = await minoristaTransactionService.createTransaction(
            {
              minoristaId: minorista.id,
              amount: data.amountCop,
              type: MinoristaTransactionType.DISCOUNT,
              status: MinoristaTransactionStatus.PENDING,
              createdBy,
            },
            em
          )

          if ('error' in transactionResult) {
            throw new Error('INSUFFICIENT_BALANCE')
          }

          minoristaTransaction = transactionResult

          // Recargar minorista para obtener balance actualizado
          // Recargar minorista para obtener balance actualizado
          // await em.refresh(minorista) // REMOVED: Reverts uncommited changes
        }

        // Calcular ganancias: ((monto / sellRate) * buyRate) - monto
        // Note: formula assumes buyRate is "how much COP we pay per VES" logic or similar.
        // Based on createGiro: data.amountInput - (data.amountInput / data.rateApplied.sellRate) * data.rateApplied.buyRate
        const totalProfit = data.amountCop - (data.amountCop / exchangeRate.sellRate) * exchangeRate.buyRate

        // Calcular ganancias: Porcentaje configurado para minorista (si existe), resto para el sistema
        const minoristaProfit = minorista ? data.amountCop * minorista.profitPercentage : 0
        const systemProfit = totalProfit - minoristaProfit

        const giroRepo = em.getRepository(Giro)

        // Fallback for beneficiaryName if kontaktEnvia is missing
        // Since 'beneficiaryName' is NOT NULL, we must provide a value.
        // If contactEnvia is removed, we use 'Pago Movil' or similar placeholder.
        const beneficiaryNameFallback = data.contactoEnvia?.trim() || `Pago Móvil - ${data.phone}`

        // Crear giro
        const giro = giroRepo.create({
          minorista,
          transferencista: assigned,
          beneficiaryName: beneficiaryNameFallback,
          beneficiaryId: data.cedula,
          bankName: bank.name,
          bankCode: bank.code,
          accountNumber: data.phone,
          phone: data.phone,
          rateApplied: exchangeRate,
          amountInput: data.amountCop,
          currencyInput: Currency.COP,
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

        await em.persistAndFlush(giro)

        // Vincular transacción al giro
        if (minoristaTransaction) {
          minoristaTransaction.giro = giro
          em.persist(minoristaTransaction)
          await em.flush()
        }

        // Enviar notificación (WebSocket)
        console.log(
          `[GIRO-SERVICE] Intentando enviar notificación al transferencista ${assigned.user.id} para giro ${giro.id}`
        )
        await sendGiroAssignedNotification(assigned.user.id, giro.id, giro.amountBs, giro.executionType)
        console.log(`[GIRO-SERVICE] Notificación enviada (o proceso completado) para giro ${giro.id}`)

        // Enviar correo electrónico al transferencista
        try {
          const emailSubject = `Nuevo Giro Asignado (${giro.executionType}) - ${giro.amountBs.toFixed(2)} Bs`
          const emailBody = `
            <h1>Nuevo Giro Asignado</h1>
            <p>Se te ha asignado un nuevo giro (${giro.executionType}) para procesar.</p>
            <ul>
              <li><strong>Monto:</strong> ${giro.amountBs.toFixed(2)} Bs</li>
              <li><strong>Banco:</strong> ${bank.name}</li>
              <li><strong>Cuenta:</strong> ${giro.accountNumber}</li>
              <li><strong>Beneficiario:</strong> ${giro.beneficiaryName}</li>
              <li><strong>Generado por:</strong> ${createdBy.fullName || createdBy.email}</li>
              <li><strong>ID Giro:</strong> ${giro.id}</li>
              <li><strong>Tipo:</strong> ${giro.executionType}</li>
            </ul>
            <p>Por favor, ingresa a la plataforma para procesarlo.</p>
          `

          // Asumimos que el usuario del transferencista tiene email
          if (assigned.user.email) {
            const { error } = await sendEmail(assigned.user.email, emailSubject, emailBody)
            if (error) {
              console.error(`[EMAIL] Falló envío a ${assigned.user.email}:`, error)
            } else {
              console.info(`[EMAIL] Enviado correctamente a ${assigned.user.email} (Giro: ${giro.id})`)
            }
          } else {
            console.warn(`[EMAIL] Transferencista ${assigned.id} no tiene email configurado.`)
          }
        } catch (emailError) {
          console.error('[EMAIL] Error al enviar correo de notificación:', emailError)
          // No lanzamos error para no revertir la transacción del giro
        }

        // Guardar sugerencia de beneficiario después de la transacción exitosa
        // Nota: Esto es un side-effect dentro de la transacción, pero es aceptable.
        // Si falla, no aborta la transacción principal (try-catch interno).
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
      })
      .catch((error) => {
        if (error.message === 'INSUFFICIENT_BALANCE') {
          return { error: 'INSUFFICIENT_BALANCE' as const }
        }
        if (error.message === 'NO_TRANSFERENCISTA_ASSIGNED') {
          return { error: 'NO_TRANSFERENCISTA_ASSIGNED' as const }
        }
        console.error('Error al crear pago móvil:', error)
        throw error
      })
  }

  async updateGiro(
    giroId: string,
    data: {
      beneficiaryName: string
      beneficiaryId: string
      bankId: string
      accountNumber: string
      phone: string
    },
    user: User
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
      throw new Error('GIRO_NOT_FOUND')
    }

    const bank = await DI.banks.findOne({ id: data.bankId })
    if (!bank) {
      throw new Error('BANCO_NO_ENCONTRADO')
    }

    return await DI.em.transactional(async (em) => {
      // Detectar reactivación: Estaba DEVUELTO y se va a actualizar (implica re-asignar)
      if (giro.status === GiroStatus.DEVUELTO) {
        console.info(`[GIRO] Reactivating returned giro (giroId: ${giroId}, user: ${user.id})`)
        giro.status = GiroStatus.ASIGNADO

        // Si pertenece a un minorista, debemos volver a descontar el saldo
        // (Al devolverlo se le reembolsó, así que para activarlo debe pagar de nuevo)
        if (giro.minorista) {
          console.info(
            `[GIRO] Processing re-deduction for minorista (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, amount: ${giro.amountInput})`
          )

          const transactionResult = await minoristaTransactionService.createTransaction(
            {
              minoristaId: giro.minorista.id,
              amount: giro.amountInput,
              type: MinoristaTransactionType.DISCOUNT,
              createdBy: user,
            },
            em
          )

          if ('error' in transactionResult) {
            console.error(
              `[GIRO] Re-deduction failed (giroId: ${giroId}, minoristaId: ${giro.minorista.id}, error: ${transactionResult.error})`
            )
            throw new Error('INSUFFICIENT_BALANCE') // O el error específico
          }

          // Vincular nueva transacción (Re-deduction) al giro
          transactionResult.giro = giro
          em.persist(transactionResult)

          console.info(`[GIRO] Re-deduction successful (giroId: ${giroId})`)
        }
      }

      giro.beneficiaryName = data.beneficiaryName
      giro.beneficiaryId = data.beneficiaryId
      giro.bankName = bank.name
      giro.accountNumber = data.accountNumber
      giro.phone = data.phone
      giro.updatedAt = new Date()

      em.persist(giro)
      return giro
    })
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

    // Solo giros en estado ASIGNADO pueden tener su tasa modificada
    if (giro.status !== GiroStatus.ASIGNADO) {
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
      // Minorista: Porcentaje configurado para él, resto para el sistema
      newMinoristaProfit = giro.amountInput * giro.minorista.profitPercentage
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
}

export const giroService = new GiroService()
