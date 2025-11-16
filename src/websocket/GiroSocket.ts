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
      console.log(`[WS] Usuario conectado: ${socket.id}`)

      // Evento: Usuario se conecta y proporciona su información
      socket.on('user:connected', (data: { userId: string; role: UserRole; minoristaId?: string; transferencistaId?: string }) => {
        this.connectedUsers.set(socket.id, {
          socketId: socket.id,
          userId: data.userId,
          role: data.role,
          minoristaId: data.minoristaId,
          transferencistaId: data.transferencistaId,
        })
        console.log(`[WS] Usuario autenticado: ${data.userId} (${data.role})`)
      })

      // Evento: Usuario se desconecta
      socket.on('disconnect', () => {
        const user = this.connectedUsers.get(socket.id)
        if (user) {
          console.log(`[WS] Usuario desconectado: ${user.userId}`)
          this.connectedUsers.delete(socket.id)
        }
      })
    })
  }

  /**
   * Emitir evento cuando se crea un nuevo giro
   */
  broadcastGiroCreated(giro: Giro) {
    console.log(`[WS] Broadcast: Giro creado - ${giro.id}`)

    // Enviar a todos los clientes
    this.io.emit('giro:created', {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Emitir evento cuando se actualiza un giro
   */
  broadcastGiroUpdated(giro: Giro, changeType: 'rate' | 'status' | 'beneficiary' | 'other' = 'other') {
    console.log(`[WS] Broadcast: Giro actualizado - ${giro.id} (${changeType})`)

    // Enviar a todos los clientes
    this.io.emit('giro:updated', {
      giro: this.serializeGiro(giro),
      changeType,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Emitir evento cuando se devuelve un giro
   */
  broadcastGiroReturned(giro: Giro, reason: string) {
    console.log(`[WS] Broadcast: Giro devuelto - ${giro.id}`)

    // Enviar a todos los clientes
    this.io.emit('giro:returned', {
      giro: this.serializeGiro(giro),
      reason,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Emitir evento cuando se ejecuta un giro
   */
  broadcastGiroExecuted(giro: Giro) {
    console.log(`[WS] Broadcast: Giro ejecutado - ${giro.id}`)

    // Enviar a todos los clientes
    this.io.emit('giro:executed', {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Emitir evento cuando se marca giro como procesando
   */
  broadcastGiroProcessing(giro: Giro) {
    console.log(`[WS] Broadcast: Giro procesando - ${giro.id}`)

    this.io.emit('giro:processing', {
      giro: this.serializeGiro(giro),
      timestamp: new Date().toISOString(),
    })
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
      proofUrl: giro.proofUrl,
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
   */
  broadcastGiroDeleted(giroId: string) {
    console.log(`[WS] Broadcast: Giro eliminado - ${giroId}`)

    // Enviar a todos los clientes
    this.io.emit('giro:deleted', {
      giroId,
      timestamp: new Date().toISOString(),
    })
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
