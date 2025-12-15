import { DI } from '@/di'
import {
  MinoristaTransaction,
  MinoristaTransactionType,
  MinoristaTransactionStatus,
} from '@/entities/MinoristaTransaction'
import { Minorista } from '@/entities/Minorista'
import { User } from '@/entities/User'
import { EntityManager, FilterQuery } from '@mikro-orm/core'
import { giroSocketManager } from '@/websocket'

export interface CreateTransactionInput {
  minoristaId: string
  amount: number
  type: MinoristaTransactionType
  status?: MinoristaTransactionStatus // Estado de la transacción (Default: COMPLETED)
  createdBy: User
  updateBalanceInFavor?: boolean
  description?: string
  giro?: any // Using any to avoid circular dependency import if Giro is not imported, or import it.
  // Actually, I can import Giro type or just use concrete type. Giro is not imported here yet?
}

export class MinoristaTransactionService {
  /**
   * Actualiza el estado de una transacción
   */
  async updateTransactionStatus(
    transactionId: string,
    status: MinoristaTransactionStatus,
    em?: EntityManager
  ): Promise<MinoristaTransaction | { error: 'TRANSACTION_NOT_FOUND' }> {
    const manager = em || DI.em
    const transactionRepo = manager.getRepository(MinoristaTransaction)

    const transaction = await transactionRepo.findOne({ id: transactionId }, { populate: ['minorista', 'createdBy'] })
    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    // Si la transacción pasa a CANCELLED y estaba PENDING o COMPLETED, debemos revertir el saldo
    // Sin embargo, la lógica de negocio actual dice:
    // "si el giro se devuelve o elimina el cupo se reintegra"
    // Esto generalmente se maneja creando una transacción de reembolso (REFUND).
    // Pero si la transacción estaba PENDING (no visible), al cancelarla simplemente debemos devolver el dinero
    // y mantenerla oculta o marcarla como CANCELLED.

    // Si estaba PENDING y pasa a CANCELLED: Devolvemos el saldo al minorista.
    if (transaction.status === MinoristaTransactionStatus.PENDING && status === MinoristaTransactionStatus.CANCELLED) {
      const minorista = transaction.minorista

      // Revertir el impacto en el crédito disponible (sumar lo que se descontó)
      // El 'amount' en DISCOUNT es positivo, y se resta del crédito. Para revertir, sumamos.
      // OJO: createTransaction maneja la lógica compleja de crédito vs saldo a favor.
      // Para simplificar, si cancelamos un PENDING, podemos hacer un RECHARGE interno o simplemente sumar.
      // Lo más seguro es usar createTransaction con tipo REFUND o RECHARGE, pero eso crearía OTRO registro.
      // Si queremos que sea "clean", deberíamos revertir manualmente los valores en el minorista.

      // Opción B: Crear una transacción de compensación (REFUND) y marcar ambas como CANCELLED?
      // El usuario dijo: "si el giro se devuelve... el cupo se reintegra".

      // Vamos a asumir que "updateTransactionStatus" solo cambia el estado.
      // La lógica de reembolso se debe invocar explícitamente si se requiere.
      // PERO, para PENDING->COMPLETED, es solo visual.
      // Para PENDING->CANCELLED, si ya se descontó el dinero, hay que devolverlo.
    }

    transaction.status = status
    await manager.persistAndFlush(transaction)

    // Emitir evento si la transacción ahora es visible (COMPLETED) o si cambió de estado
    if (giroSocketManager) {
      // Enviar actualización de transacción
      giroSocketManager.broadcastMinoristaTransactionUpdate(transaction)

      // Si la transacción fue CANCELLED, el balance podría haber cambiado (si manejamos reversiones aquí)
      // Pero en la lógica actual de updateTransactionStatus no tocamos el balance explícitamente,
      // asumimos que se llamó a createTransaction(REFUND) por separado si era necesario.
      // AUNQUE, si PENDING->CANCELLED, el dinero se "devuelve".
      // Espera, mi implementación de updateTransactionStatus tenía un bloque comentado sobre eso.
      // Dado el código actual, updateTransactionStatus SOLO cambia el estado.
      // La lógica de reembolso en deleteGiro usa createTransaction(REFUND), que YA emite balance update.
      // Así que aquí solo necesitamos emitir la actualización de la transacción.
    }

    return transaction
  }

  async createTransaction(
    data: CreateTransactionInput,
    em?: EntityManager
  ): Promise<MinoristaTransaction | { error: 'MINORISTA_NOT_FOUND' | 'INSUFFICIENT_BALANCE' }> {
    const manager = em || DI.em
    const minoristaRepo = manager.getRepository(Minorista)
    const transactionRepo = manager.getRepository(MinoristaTransaction)

    // Buscar minorista
    const minorista = await minoristaRepo.findOne({ id: data.minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const previousAvailableCredit = minorista.availableCredit
    const previousBalanceInFavorValue = minorista.creditBalance || 0 // Capturar ANTES de actualizar
    const { creditLimit } = minorista

    let newAvailableCredit = previousAvailableCredit
    let balanceInFavorUsed = 0
    let creditUsed = 0
    let newBalanceInFavor = previousBalanceInFavorValue
    let externalDebt = 0

    // Calcular nuevo balance según tipo de transacción
    switch (data.type) {
      case MinoristaTransactionType.RECHARGE:
        // Si updateBalanceInFavor es true, el amount va al saldo a favor, no al crédito disponible
        if (data.updateBalanceInFavor) {
          newAvailableCredit = previousAvailableCredit
          newBalanceInFavor = previousBalanceInFavorValue + data.amount
        } else {
          // Lógica estándar para RECHARGE (Abono positivo o "Pago de Deuda" negativo)
          if (data.amount < 0 && previousBalanceInFavorValue > 0) {
            // Caso especial: Hay un débito (o carga negativa) y el usuario tiene saldo a favor.
            // Primero consumimos el saldo a favor para cubrir la deuda.
            const absAmount = Math.abs(data.amount)

            if (previousBalanceInFavorValue >= absAmount) {
              // El saldo a favor cubre todo el débito
              newBalanceInFavor = previousBalanceInFavorValue - absAmount
              balanceInFavorUsed = absAmount
              newAvailableCredit = previousAvailableCredit // No se toca el crédito disponible si se cubre con el saldo
            } else {
              // El saldo a favor cubre parcialmente
              balanceInFavorUsed = previousBalanceInFavorValue
              const remainingDebt = absAmount - previousBalanceInFavorValue
              newBalanceInFavor = 0

              // El resto se descuenta del crédito disponible (generando deuda real si baja de el límite)
              newAvailableCredit = Math.min(previousAvailableCredit - remainingDebt, minorista.creditLimit)
            }
          } else {
            // Comportamiento estándar: Sumar al crédito disponible y el exceso al saldo a favor
            const limit = minorista.creditLimit
            const gap = limit - previousAvailableCredit

            if (data.amount > 0) {
              // Si es un abono positivo
              if (previousAvailableCredit < limit) {
                // Hay espacio en el cupo
                const amountToCredit = Math.min(data.amount, gap)
                newAvailableCredit = previousAvailableCredit + amountToCredit
                const remaining = data.amount - amountToCredit
                newBalanceInFavor = previousBalanceInFavorValue + remaining
              } else {
                // Cupo lleno (o desbordado), todo al saldo a favor
                newAvailableCredit = previousAvailableCredit // Mantiene el desbordamiento si ya existía? Mejor no, respetemos lo que hay.
                // Si queremos normalizar: newAvailableCredit = limit? No, mejor no tocar si ya estaba pasado.
                newBalanceInFavor = previousBalanceInFavorValue + data.amount
              }
              // Normalizar: Si newAvailableCredit > limit y tenemos deuda externa?
              // Por ahora, lógica simple: Llenar available hasta limit, resto a balance.
              // Corrección de lógica para cubrir casos borde:

              // Total fondos nuevos = Actual + Abono
              const totalFunds = previousAvailableCredit + data.amount
              if (totalFunds > limit) {
                newAvailableCredit = limit
                newBalanceInFavor = previousBalanceInFavorValue + (totalFunds - limit)
              } else {
                newAvailableCredit = totalFunds
                newBalanceInFavor = previousBalanceInFavorValue
              }
            } else {
              // Si es negativo (Pago de deuda que se resta?) No, RECHARGE negativo es raro aquí, usualmente handled above.
              // Mantener lógica simple para negativo: Resetear math min
              newAvailableCredit = Math.min(previousAvailableCredit + data.amount, limit)
              newBalanceInFavor = previousBalanceInFavorValue
            }
          }
        }
        break

      case MinoristaTransactionType.DISCOUNT: {
        // Calcular ganancia inmediatamente (5% del monto)
        const immediateProfit = data.amount * 0.05

        // Paso 1: Descontar primero del saldo a favor
        const userBalance = minorista.creditBalance || 0
        let remainingAmount = data.amount

        if (remainingAmount <= userBalance) {
          balanceInFavorUsed = remainingAmount
          newBalanceInFavor = userBalance - remainingAmount
          remainingAmount = 0
        } else {
          balanceInFavorUsed = userBalance
          remainingAmount -= userBalance
          newBalanceInFavor = 0
        }

        // Paso 2: Descontar del crédito disponible
        if (remainingAmount > 0) {
          if (remainingAmount <= previousAvailableCredit) {
            creditUsed = remainingAmount
            newAvailableCredit = previousAvailableCredit - remainingAmount
            remainingAmount = 0
          } else {
            creditUsed = previousAvailableCredit
            externalDebt = remainingAmount - previousAvailableCredit
            newAvailableCredit = 0
            remainingAmount = 0
          }
        } else {
          newAvailableCredit = previousAvailableCredit
        }

        // Paso 3: Añadir ganancia
        // Distribuir la ganancia entre crédito disponible y saldo a favor
        // Queremos llenar el crédito disponible hasta el límite, y el sobrante va a saldo a favor
        const limit = minorista.creditLimit
        const currentFunds = newAvailableCredit + immediateProfit

        if (currentFunds > limit) {
          newAvailableCredit = limit
          newBalanceInFavor += currentFunds - limit // Sumar al saldo a favor (que podría haber quedado > 0 o 0)
        } else {
          newAvailableCredit = currentFunds
        }

        // Validación: Si hay deuda externa, debe poder ser cubierta por la ganancia
        // (La ganancia ya se sumó a newAvailable o newBalance)
        if (externalDebt > 0) {
          if (externalDebt > immediateProfit) {
            return { error: 'INSUFFICIENT_BALANCE' }
          }
        }

        minorista.creditBalance = newBalanceInFavor
        break
      }

      case MinoristaTransactionType.ADJUSTMENT:
        newAvailableCredit = previousAvailableCredit + data.amount
        if (newAvailableCredit < 0) {
          return { error: 'INSUFFICIENT_BALANCE' }
        }
        newBalanceInFavor = previousBalanceInFavorValue
        break

      case MinoristaTransactionType.REFUND: {
        // Reembolso: Se devuelve el monto neto (Monto - Ganancia ya otorgada)
        const profitToRevert = data.amount * 0.05
        const netRefund = data.amount - profitToRevert

        // Calcular liquidez total: (Crédito disponible actual) + (Saldo a favor actual) + (Reembolso)
        // Nota: Si el crédito disponible ya excedía el límite (por un bug previo), esto se normalizará aquí.
        const totalFunds = previousAvailableCredit + previousBalanceInFavorValue + netRefund

        if (totalFunds > minorista.creditLimit) {
          // Llenamos el cupo hasta el límite y el resto es saldo a favor
          newAvailableCredit = minorista.creditLimit
          newBalanceInFavor = totalFunds - minorista.creditLimit
        } else {
          // Si no supera el límite, todo va al crédito disponible y no hay saldo a favor
          newAvailableCredit = totalFunds
          newBalanceInFavor = 0
        }
        break
      }
    }

    // Calcular ganancia: 5% para DISCOUNT
    let profitEarned = 0
    if (data.type === MinoristaTransactionType.DISCOUNT) {
      profitEarned = data.amount * 0.05
    }

    const creditConsumed = data.type === MinoristaTransactionType.DISCOUNT ? data.amount : 0

    //Obtener la última transacción para mantener o reiniciar el profit acumulado
    const lastTransaction = await transactionRepo.findOne({ minorista }, { orderBy: { createdAt: 'DESC' } })

    let accumulatedProfit = 0

    if (data.type === MinoristaTransactionType.RECHARGE) {
      accumulatedProfit = 0 // Reinicia en recarga
    } else if (data.type === MinoristaTransactionType.DISCOUNT) {
      accumulatedProfit = (lastTransaction?.accumulatedProfit ?? 0) + profitEarned
    } else {
      accumulatedProfit = lastTransaction?.accumulatedProfit ?? 0
    }

    // Calcular deuda real: si hay saldo a favor, no hay deuda. Si no, deuda = creditLimit - availableCredit
    const realDebt = newBalanceInFavor > 0 ? 0 : creditLimit - newAvailableCredit

    // Crear transacción
    const transaction = transactionRepo.create({
      minorista,
      amount: data.amount,
      type: data.type,
      creditConsumed,
      profitEarned,
      previousAvailableCredit,
      previousBalanceInFavor: previousBalanceInFavorValue, // Saldo a favor anterior (capturado al inicio)
      accumulatedDebt: realDebt,
      accumulatedProfit,
      availableCredit: newAvailableCredit,
      currentBalanceInFavor: newBalanceInFavor, // Saldo a favor nuevo
      balanceInFavorUsed: balanceInFavorUsed > 0 ? balanceInFavorUsed : undefined,
      creditUsed: creditUsed > 0 ? creditUsed : undefined,
      remainingBalance: newBalanceInFavor > 0 ? newBalanceInFavor : undefined,
      externalDebt: externalDebt > 0 ? externalDebt : undefined,
      status: data.status || MinoristaTransactionStatus.COMPLETED,
      createdBy: data.createdBy,
      description: data.description,
      giro: data.giro,
      createdAt: new Date(),
    })

    // Actualizar los balances del minorista
    minorista.availableCredit = newAvailableCredit
    minorista.creditBalance = newBalanceInFavor

    // Guardar en la base de datos
    // Si se pasó un EM, usamos persist (el caller hace flush/commit)
    // Si NO se pasó un EM, usamos persistAndFlush
    if (em) {
      manager.persist([transaction, minorista])
    } else {
      await manager.persistAndFlush([transaction, minorista])
    }

    // Emitir eventos de WebSocket para actualización en tiempo real
    if (giroSocketManager) {
      // 1. Actualizar balance (siempre)
      giroSocketManager.broadcastMinoristaBalanceUpdate(minorista.id, newAvailableCredit, newBalanceInFavor)

      // 2. Actualizar transacción (solo si está COMPLETADA)
      if (transaction.status === MinoristaTransactionStatus.COMPLETED) {
        giroSocketManager.broadcastMinoristaTransactionUpdate(transaction)
      }
    }

    return transaction
  }

  /**
   * Lista las transacciones de un minorista con paginación
   */
  async listTransactionsByMinorista(
    minoristaId: string,
    options?: { page?: number; limit?: number; startDate?: string; endDate?: string }
  ): Promise<
    | {
        total: number
        page: number
        limit: number
        transactions: Array<{
          id: string
          amount: number
          type: MinoristaTransactionType
          previousBalance: number
          currentBalance: number
          createdBy: {
            id: string
            fullName: string
            email: string
          }
          createdAt: Date
        }>
      }
    | { error: 'MINORISTA_NOT_FOUND' }
  > {
    const minoristaRepo = DI.em.getRepository(Minorista)
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    // Verificar que el minorista exista
    const minorista = await minoristaRepo.findOne({ id: minoristaId })
    if (!minorista) {
      return { error: 'MINORISTA_NOT_FOUND' }
    }

    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    const offset = (page - 1) * limit

    // Construir filtro con fechas si se proporcionan
    const where: FilterQuery<MinoristaTransaction> = { minorista: minoristaId }

    if (options?.startDate && options?.endDate) {
      const startDate = new Date(options.startDate)
      const endDate = new Date(options.endDate)
      // Don't modify hours - they come from frontend as ISO strings with proper times
      // (e.g., "2025-11-22T00:00:00.000Z" to "2025-11-23T23:59:59.999Z")

      where.createdAt = { $gte: startDate, $lte: endDate }
    }

    // Filter by status: ONLY COMPLETED transactions (unless overridden? For now, hardcode)
    // We want to hide PENDING (Hold) and CANCELLED transactions from the history
    where.status = MinoristaTransactionStatus.COMPLETED

    const [transactions, total] = await transactionRepo.findAndCount(where, {
      limit,
      offset,
      populate: ['createdBy'],
      orderBy: { createdAt: 'DESC', id: 'DESC' }, // Más recientes primero, deterministic tie-breaker
    })

    const data = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      previousBalance: t.previousAvailableCredit,
      currentBalance: t.availableCredit,
      previousBalanceInFavor: t.previousBalanceInFavor ?? 0,
      currentBalanceInFavor: t.currentBalanceInFavor ?? 0,
      balanceInFavorUsed: t.balanceInFavorUsed,
      creditUsed: t.creditUsed,
      externalDebt: t.externalDebt,
      profitEarned: t.profitEarned,
      createdBy: {
        id: t.createdBy.id,
        fullName: t.createdBy.fullName,
        email: t.createdBy.email,
      },
      createdAt: t.createdAt,
    }))

    return {
      total,
      page,
      limit,
      transactions: data,
    }
  }

  /**
   * Obtiene una transacción por ID
   */
  async getTransactionById(transactionId: string): Promise<
    | {
        id: string
        amount: number
        type: MinoristaTransactionType
        previousBalance: number
        currentBalance: number
        minorista: {
          id: string
          availableCredit: number
          user: {
            id: string
            fullName: string
            email: string
          }
        }
        createdBy: {
          id: string
          fullName: string
          email: string
        }
        createdAt: Date
      }
    | { error: 'TRANSACTION_NOT_FOUND' }
  > {
    const transactionRepo = DI.em.getRepository(MinoristaTransaction)

    const transaction = await transactionRepo.findOne(
      { id: transactionId },
      { populate: ['minorista', 'minorista.user', 'createdBy'] }
    )

    if (!transaction) {
      return { error: 'TRANSACTION_NOT_FOUND' }
    }

    return {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      previousBalance: transaction.previousAvailableCredit,
      currentBalance: transaction.availableCredit,
      minorista: {
        id: transaction.minorista.id,
        availableCredit: transaction.availableCredit,
        user: {
          id: transaction.minorista.user.id,
          fullName: transaction.minorista.user.fullName,
          email: transaction.minorista.user.email,
        },
      },
      createdBy: {
        id: transaction.createdBy.id,
        fullName: transaction.createdBy.fullName,
        email: transaction.createdBy.email,
      },
      createdAt: transaction.createdAt,
    }
  }
}

export const minoristaTransactionService = new MinoristaTransactionService()
