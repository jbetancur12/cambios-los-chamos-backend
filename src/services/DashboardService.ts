import { DI } from '@/di'
import { RequestUser } from '@/middleware/requestUser'
import { Giro } from '@/entities/Giro'

export interface DashboardStats {
  girosCount: number
  girosLabel: string
  usersCount?: number
  volumeBs?: number
  volumeCOP?: number
  volumeUSD?: number
  systemEarnings?: number
  minoristaEarnings?: number
  earnings?: number // Para minoristas (solo su parte)
}

export class DashboardService {
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
      const girosToday = await DI.giros.count({
        createdAt: { $gte: today, $lt: tomorrow },
      })

      const activeUsers = await DI.users.count({
        isActive: true,
      })

      const girosThisMonth = await DI.giros.find({
        createdAt: { $gte: monthStart, $lte: monthEnd },
      })

      const volumeBs = girosThisMonth.reduce((sum: number, giro: Giro) => sum + Number(giro.amountBs), 0)
      const volumeCOP = girosThisMonth.reduce((sum: number, giro: Giro) => {
        return giro.currencyInput === 'COP' ? sum + Number(giro.amountInput) : sum
      }, 0)
      const volumeUSD = girosThisMonth.reduce((sum: number, giro: Giro) => {
        return giro.currencyInput === 'USD' ? sum + Number(giro.amountInput) : sum
      }, 0)
      const systemEarnings = girosThisMonth.reduce((sum: number, giro: Giro) => sum + Number(giro.systemProfit), 0)
      const minoristaEarnings = girosThisMonth.reduce(
        (sum: number, giro: Giro) => sum + Number(giro.minoristaProfit),
        0
      )

      return {
        girosCount: girosToday,
        girosLabel: 'Giros Hoy',
        usersCount: activeUsers,
        volumeBs,
        volumeCOP,
        volumeUSD,
        systemEarnings,
        minoristaEarnings,
      }
    } else if (role === 'TRANSFERENCISTA') {
      // Transferencista stats
      const transferencista = user.transferencista
      if (!transferencista) {
        throw new Error('Transferencista no encontrado')
      }

      const myGiros = await DI.giros.count({
        transferencista: transferencista.id,
      })

      return {
        girosCount: myGiros,
        girosLabel: 'Mis Giros Asignados',
      }
    } else if (role === 'MINORISTA') {
      // Minorista stats
      const minorista = user.minorista
      if (!minorista) {
        throw new Error('Minorista no encontrado')
      }

      const myGiros = await DI.giros.count({
        minorista: minorista.id,
      })

      const girosThisMonth = await DI.giros.find({
        minorista: minorista.id,
        createdAt: { $gte: monthStart, $lte: monthEnd },
      })

      const earnings = girosThisMonth.reduce((sum: number, giro: Giro) => sum + Number(giro.minoristaProfit), 0)

      return {
        girosCount: myGiros,
        girosLabel: 'Mis Giros',
        earnings,
      }
    }

    throw new Error('Rol no reconocido')
  }
}
