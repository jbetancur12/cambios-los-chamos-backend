import { Server as SocketIOServer, Socket } from 'socket.io'
import { Giro } from '@/entities/Giro'
import { UserRole } from '@/entities/User'

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

    // Enviar a admins
    this.broadcastToAdmins('giro:created', payload)

    // Enviar al minorista si es su giro
    if (giro.minorista?.id) {
      this.broadcastToMinorista(giro.minorista.id, 'giro:created', payload)
    }

    // Enviar al transferencista asignado
    if (giro.transferencista?.id) {
      this.broadcastToTransferencista(giro.transferencista.id, 'giro:created', payload)
    }
  }

  /**
   * Emitir evento cuando se actualiza un giro
   * Filtrado por rol: MINORISTA solo su giro, TRANSFERENCISTA solo asignado
   */
  broadcastGiroUpdated(giro: Giro, changeType: 'rate' | 'status' | 'beneficiary' | 'other' = 'other') {
    console.log(`[WS] Broadcast: Giro actualizado - ${giro.id} (${changeType})`)

    const payload = {
      giro: this.serializeGiro(giro),
      changeType,
      timestamp: new Date().toISOString(),
    }

    // Enviar a admins
    this.broadcastToAdmins('giro:updated', payload)

    // Enviar al minorista si es su giro
    if (giro.minorista?.id) {
      this.broadcastToMinorista(giro.minorista.id, 'giro:updated', payload)
    }

    // Enviar al transferencista asignado
    if (giro.transferencista?.id) {
      this.broadcastToTransferencista(giro.transferencista.id, 'giro:updated', payload)
    }
  }

  /**
   * Emitir evento cuando se devuelve un giro
   */
  broadcastGiroReturned(giro: Giro, reason: string) {
    console.log(`[WS] Broadcast: Giro devuelto - ${giro.id}`)

    const payload = {
      giro: this.serializeGiro(giro),
      reason,
      timestamp: new Date().toISOString(),
    }

    // Enviar a admins
    this.broadcastToAdmins('giro:returned', payload)

    // Enviar al minorista si es su giro
    if (giro.minorista?.id) {
      this.broadcastToMinorista(giro.minorista.id, 'giro:returned', payload)
    }

    // Enviar al transferencista asignado
    if (giro.transferencista?.id) {
      this.broadcastToTransferencista(giro.transferencista.id, 'giro:returned', payload)
    }
  }

  /**
   * Emitir evento cuando se ejecuta un giro
   */
  broadcastGiroExecuted(giro: Giro) {
    console.log(`[WS] Broadcast: Giro ejecutado - ${giro.id}`)

    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a admins
    this.broadcastToAdmins('giro:executed', payload)

    // Enviar al minorista si es su giro
    if (giro.minorista?.id) {
      this.broadcastToMinorista(giro.minorista.id, 'giro:executed', payload)
    }

    // Enviar al transferencista que ejecutó
    if (giro.transferencista?.id) {
      this.broadcastToTransferencista(giro.transferencista.id, 'giro:executed', payload)
    }
  }

  /**
   * Emitir evento cuando se marca giro como procesando
   */
  broadcastGiroProcessing(giro: Giro) {
    const payload = {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    }

    // Enviar a admins
    this.broadcastToAdmins('giro:processing', payload)

    // Enviar al minorista si es su giro
    if (giro.minorista?.id) {
      this.broadcastToMinorista(giro.minorista.id, 'giro:processing', payload)
    }

    // Enviar al transferencista asignado
    if (giro.transferencista?.id) {
      this.broadcastToTransferencista(giro.transferencista.id, 'giro:processing', payload)
    }
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
    console.log(`[WS] Broadcast: Giro eliminado - ${giroId}`)

    const payload = {
      giroId,
      timestamp: new Date().toISOString(),
    }

    // Enviar a admins (minorista/transferencista se enterarán vía query invalidation)
    this.broadcastToAdmins('giro:deleted', payload)
  }

  /**
   * Enviar mensaje a todos los admins
   */
  private broadcastToAdmins(event: string, payload: any) {
    const adminUsers = Array.from(this.connectedUsers.values()).filter(
      (user) => user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN
    )

    for (const adminUser of adminUsers) {
      this.io.to(adminUser.socketId).emit(event, payload)
    }
  }

  /**
   * Enviar mensaje a un minorista específico
   */
  private broadcastToMinorista(minoristaId: string, event: string, payload: any) {
    const minoristaUsers = Array.from(this.connectedUsers.values()).filter((user) => user.minoristaId === minoristaId)

    for (const minoristaUser of minoristaUsers) {
      this.io.to(minoristaUser.socketId).emit(event, payload)
    }
  }

  /**
   * Enviar mensaje a un transferencista específico
   */
  private broadcastToTransferencista(transferencistaId: string, event: string, payload: any) {
    const transferencistaUsers = Array.from(this.connectedUsers.values()).filter(
      (user) => user.transferencistaId === transferencistaId
    )

    for (const transferencistaUser of transferencistaUsers) {
      this.io.to(transferencistaUser.socketId).emit(event, payload)
    }
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
}

export let giroSocketManager: GiroSocketManager
export function setGiroSocketManager(manager: GiroSocketManager) {
  giroSocketManager = manager
}
