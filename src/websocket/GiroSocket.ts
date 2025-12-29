import { Server as SocketIOServer, Socket } from 'socket.io'
import { Giro } from '@/entities/Giro'
import { UserRole } from '@/entities/User'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'

interface ConnectedUser {
  socketId: string
  userId: string
  role: UserRole
  minoristaId?: string
  transferencistaId?: string
}

export class GiroSocketManager {
  private io: SocketIOServer
  private connectedUsers: Map<string, ConnectedUser> = new Map()

  constructor(io: SocketIOServer) {
    this.io = io
    this.setupConnectionHandlers()
  }

  private setupConnectionHandlers() {
    this.io.on('connection', (socket: Socket) => {
      // Evento: Usuario se conecta y proporciona su información
      socket.on(
        'user:connected',
        (data: { userId: string; role: UserRole; minoristaId?: string; transferencistaId?: string }) => {
          this.connectedUsers.set(socket.id, {
            socketId: socket.id,
            userId: data.userId,
            role: data.role,
            minoristaId: data.minoristaId,
            transferencistaId: data.transferencistaId,
          })

          // Unir a rooms basadas en rol (se sincronizan vía Redis)
          if (data.role === UserRole.SUPER_ADMIN || data.role === UserRole.ADMIN) {
            socket.join('admins')
          }

          if (data.minoristaId) {
            socket.join(`minorista:${data.minoristaId}`)
          }

          if (data.transferencistaId) {
            socket.join(`transferencista:${data.transferencistaId}`)
          }
        }
      )

      // Evento: Usuario se desconecta
      socket.on('disconnect', () => {
        const user = this.connectedUsers.get(socket.id)
        if (user) {
          this.connectedUsers.delete(socket.id)
        }
      })
    })
  }

  /**
   * Emitir evento cuando se crea un nuevo giro
   * Filtrado por rol: MINORISTA solo ve sus propios giros, TRANSFERENCISTA solo los asignados
   */
  broadcastGiroCreated(giro: Giro) {
    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados (se sincroniza vía Redis entre procesos)
    this.io.emit('giro:created', payload)
  }

  /**
   * Emitir evento cuando se actualiza un giro
   * Filtrado por rol: MINORISTA solo su giro, TRANSFERENCISTA solo asignado
   */
  broadcastGiroUpdated(giro: Giro, changeType: 'rate' | 'status' | 'beneficiary' | 'other' = 'other') {
    const payload = {
      giro: this.serializeGiro(giro),
      changeType,
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados (se sincroniza vía Redis entre procesos)
    this.io.emit('giro:updated', payload)
  }

  /**
   * Emitir evento cuando se devuelve un giro
   */
  broadcastGiroReturned(giro: Giro, reason: string) {
    const payload = {
      giro: this.serializeGiro(giro),
      reason,
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados
    this.io.emit('giro:returned', payload)
  }

  /**
   * Emitir evento cuando se ejecuta un giro
   */
  broadcastGiroExecuted(giro: Giro) {
    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados
    this.io.emit('giro:executed', payload)
  }

  /**
   * Emitir evento cuando se marca giro como procesando
   */
  broadcastGiroProcessing(giro: Giro) {
    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados
    this.io.emit('giro:processing', payload)
  }

  /**
   * Emitir evento cuando se reasigna un giro
   */
  broadcastGiroAssigned(giro: Giro) {
    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados
    this.io.emit('giro:assigned', payload)
  }

  /**
   * Serializar giro para envío por WebSocket
   * Incluye relaciones populadas
   */
  private serializeGiro(giro: Giro) {
    return {
      id: giro.id,
      beneficiaryName: giro.beneficiaryName,
      beneficiaryId: giro.beneficiaryId,
      bankName: giro.bankName,
      accountNumber: giro.accountNumber,
      phone: giro.phone,
      amountInput: giro.amountInput,
      currencyInput: giro.currencyInput,
      amountBs: giro.amountBs,
      bcvValueApplied: giro.bcvValueApplied,
      commission: giro.commission,
      systemProfit: giro.systemProfit,
      minoristaProfit: giro.minoristaProfit,
      status: giro.status,
      executionType: giro.executionType,
      returnReason: giro.returnReason,
      paymentProofKey: giro.paymentProofKey,
      createdAt: giro.createdAt,
      updatedAt: giro.updatedAt,
      completedAt: giro.completedAt,
      minorista: giro.minorista ? { id: giro.minorista.id } : undefined,
      transferencista: giro.transferencista
        ? {
          id: giro.transferencista.id,
          user: giro.transferencista.user
            ? {
              id: giro.transferencista.user.id,
              fullName: giro.transferencista.user.fullName,
            }
            : undefined,
        }
        : undefined,
      rateApplied: giro.rateApplied
        ? {
          id: giro.rateApplied.id,
          buyRate: giro.rateApplied.buyRate,
          sellRate: giro.rateApplied.sellRate,
          usd: giro.rateApplied.usd,
          bcv: giro.rateApplied.bcv,
          isCustom: giro.rateApplied.isCustom,
        }
        : undefined,
    }
  }

  /**
   * Emitir evento cuando se elimina un giro
   * Nota: Esta función solo recibe giroId, así que envía a admins
   * Para incluir minorista/transferencista, actualizar con giro completo
   */
  broadcastGiroDeleted(giroId: string) {
    const payload = {
      giroId,
      timestamp: new Date().toISOString(),
    }

    // Enviar a TODOS los usuarios conectados
    this.io.emit('giro:deleted', payload)
  }

  /**
   * Enviar mensaje a todos los admins usando rooms (compatible con Redis adapter)
   */
  private broadcastToAdmins(event: string, payload: unknown) {
    // Usar rooms de Socket.IO que se sincronizan automáticamente vía Redis
    this.io.to('admins').emit(event, payload)
  }

  /**
   * Enviar mensaje a un minorista específico usando rooms (compatible con Redis adapter)
   */
  private broadcastToMinorista(minoristaId: string, event: string, payload: unknown) {
    this.io.to(`minorista:${minoristaId}`).emit(event, payload)
  }

  /**
   * Enviar mensaje a un transferencista específico usando rooms (compatible con Redis adapter)
   */
  private broadcastToTransferencista(transferencistaId: string, event: string, payload: unknown) {
    this.io.to(`transferencista:${transferencistaId}`).emit(event, payload)
  }

  /**
   * Obtener número de usuarios conectados
   */
  getConnectedCount(): number {
    return this.connectedUsers.size
  }

  /**
   * Obtener información de usuarios conectados
   */
  getConnectedUsers(): ConnectedUser[] {
    return Array.from(this.connectedUsers.values())
  }
  /**
   * Emitir evento cuando se actualiza el balance de un minorista
   */
  broadcastMinoristaBalanceUpdate(minoristaId: string, availableCredit: number, creditBalance: number) {
    const payload = {
      minoristaId,
      availableCredit,
      creditBalance,
      timestamp: new Date().toISOString(),
    }

    // Enviar al minorista y a los admins
    this.broadcastToMinorista(minoristaId, 'minorista:balance_updated', payload)
    this.broadcastToAdmins('minorista:balance_updated', payload)
  }

  /**
   * Emitir evento cuando se crea o actualiza una transacción de minorista
   */
  broadcastMinoristaTransactionUpdate(transaction: MinoristaTransaction) {
    const payload = {
      transaction: this.serializeMinoristaTransaction(transaction),
      timestamp: new Date().toISOString(),
    }

    // Enviar al minorista y a los admins
    this.broadcastToMinorista(transaction.minorista.id, 'minorista:transaction_updated', payload)
    this.broadcastToAdmins('minorista:transaction_updated', payload)
  }

  private serializeMinoristaTransaction(t: MinoristaTransaction) {
    return {
      id: t.id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      previousBalance: t.previousAvailableCredit,
      currentBalance: t.availableCredit,
      previousBalanceInFavor: t.previousBalanceInFavor ?? 0,
      currentBalanceInFavor: t.currentBalanceInFavor ?? 0,
      balanceInFavorUsed: t.balanceInFavorUsed,
      creditUsed: t.creditUsed,
      externalDebt: t.externalDebt,
      profitEarned: t.profitEarned,
      createdBy: t.createdBy
        ? {
          id: t.createdBy.id,
          fullName: t.createdBy.fullName,
          email: t.createdBy.email,
        }
        : undefined,
      minorista: t.minorista ? { id: t.minorista.id } : undefined,
      createdAt: t.createdAt,
    }
  }
}

export let giroSocketManager: GiroSocketManager
export function setGiroSocketManager(manager: GiroSocketManager) {
  giroSocketManager = manager
}
