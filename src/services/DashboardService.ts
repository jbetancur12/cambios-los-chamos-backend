import { GiroRepository } from '../repositories/GiroRepository'
import { UserRepository } from '../repositories/UserRepository'
import { MinoristaRepository } from '../repositories/MinoristaRepository'
import { TransferencistaRepository } from '../repositories/TransferencistaRepository'
import { RequestUser } from '../middleware/userMiddleware'
import { Between } from 'typeorm'

export interface DashboardStats {
  girosCount: number
  girosLabel: string
  usersCount?: number
  volume?: number
  earnings?: number
}

export class DashboardService {
  private giroRepo = GiroRepository
  private userRepo = UserRepository
  private minoristaRepo = MinoristaRepository
  private transferencistaRepo = TransferencistaRepository

  async getStats(requestUser: RequestUser): Promise<DashboardStats> {
    const user = requestUser.user
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const role = user.role

    // Get today's date range (midnight to midnight)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Get current month range
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      // Super Admin stats
      const girosToday = await this.giroRepo.count({
        where: { createdAt: Between(today, tomorrow) },
      })

      const activeUsers = await this.userRepo.count({
        where: { isActive: true },
      })

      const girosThisMonth = await this.giroRepo.find({
        where: { createdAt: Between(monthStart, monthEnd) },
      })

      const volume = girosThisMonth.reduce((sum, giro) => sum + Number(giro.amountBs), 0)
      const earnings = girosThisMonth.reduce((sum, giro) => sum + Number(giro.systemProfit), 0)

      return {
        girosCount: girosToday,
        girosLabel: 'Giros Hoy',
        usersCount: activeUsers,
        volume,
        earnings,
      }
    } else if (role === 'TRANSFERENCISTA') {
      // Transferencista stats
      const transferencista = requestUser.relatedEntity
      if (!transferencista) {
        throw new Error('Transferencista no encontrado')
      }

      const myGiros = await this.giroRepo.count({
        where: { transferencista: { id: transferencista.id } },
      })

      return {
        girosCount: myGiros,
        girosLabel: 'Mis Giros Asignados',
      }
    } else if (role === 'MINORISTA') {
      // Minorista stats
      const minorista = requestUser.relatedEntity
      if (!minorista) {
        throw new Error('Minorista no encontrado')
      }

      const myGiros = await this.giroRepo.count({
        where: { minorista: { id: minorista.id } },
      })

      const girosThisMonth = await this.giroRepo.find({
        where: {
          minorista: { id: minorista.id },
          createdAt: Between(monthStart, monthEnd),
        },
      })

      const earnings = girosThisMonth.reduce((sum, giro) => sum + Number(giro.minoristaProfit), 0)

      return {
        girosCount: myGiros,
        girosLabel: 'Mis Giros',
        earnings,
      }
    }

    throw new Error('Rol no reconocido')
  }
}
