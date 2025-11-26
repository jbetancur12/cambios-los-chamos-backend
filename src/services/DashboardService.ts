import { DI } from '@/di'
import { RequestUser } from '@/middleware/requestUser'
import { Giro, GiroStatus } from '@/entities/Giro'
import { wrap } from '@mikro-orm/core'

export interface DashboardStats {
  girosCount: number
  girosLabel: string
  fees?: number
  volumeBs?: number
  volumeCOP?: number
  volumeUSD?: number
  systemEarnings?: number
  minoristaEarnings?: number
  earnings?: number // Para minoristas (solo su parte)
  processingToday?: number // Para transferencistas - procesando hoy
  completedToday?: number // Para transferencistas - completados hoy
}

export interface RecentGiro {
  id: string
  beneficiaryName: string
  amountBs: number
  amountInput?: number
  currencyInput?: string
  status: string
  createdAt: Date
  minoristaName?: string
  transferencistaNombre?: string
  bankName?: string
  earnings?: number
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

      const processingToday = await DI.giros.count({
        status: GiroStatus.PROCESANDO,
        createdAt: { $gte: today, $lt: tomorrow },
      })

      // Count giros in COMPLETADO status for today
      const completedToday = await DI.giros.count({
        status: GiroStatus.COMPLETADO,
        createdAt: { $gte: today, $lt: tomorrow },
      })

      const girosThisMonth = await DI.giros.find({
        createdAt: { $gte: monthStart, $lte: monthEnd },
      })

      const feesThisMonth = girosThisMonth.reduce((sum: number, giro: Giro) => sum + Number(giro.commission), 0)

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
        fees: feesThisMonth,
        volumeBs,
        volumeCOP,
        volumeUSD,
        systemEarnings,
        minoristaEarnings,
        processingToday,
        completedToday,
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

      // Get today's date range
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      // Count giros in PROCESANDO status for today
      const processingToday = await DI.giros.count({
        transferencista: transferencista.id,
        status: GiroStatus.PROCESANDO,
        createdAt: { $gte: today, $lt: tomorrow },
      })

      // Count giros in COMPLETADO status for today
      const completedToday = await DI.giros.count({
        transferencista: transferencista.id,
        status: GiroStatus.COMPLETADO,
        createdAt: { $gte: today, $lt: tomorrow },
      })

      return {
        girosCount: myGiros,
        girosLabel: 'Mis Giros Asignados',
        processingToday,
        completedToday,
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

  async getRecentGiros(requestUser: RequestUser, limit = 5): Promise<RecentGiro[]> {
    const user = requestUser.user
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const role = user.role
    let giros: Giro[] = []

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      // Super Admin: últimos giros del sistema
      giros = await DI.giros.find(
        {},
        {
          orderBy: { createdAt: 'DESC' },
          limit,
          populate: ['minorista', 'minorista.user', 'transferencista', 'transferencista.user'],
        }
      )
    } else if (role === 'TRANSFERENCISTA') {
      // Transferencista: últimos giros asignados a él
      const transferencista = user.transferencista
      if (!transferencista) {
        throw new Error('Transferencista no encontrado')
      }

      giros = await DI.giros.find(
        { transferencista: transferencista.id },
        {
          orderBy: { createdAt: 'DESC' },
          limit,
          populate: ['minorista', 'minorista.user'],
        }
      )
    } else if (role === 'MINORISTA') {
      // Minorista: últimos giros que él creó
      const minorista = user.minorista
      if (!minorista) {
        throw new Error('Minorista no encontrado')
      }

      giros = await DI.giros.find(
        { minorista: minorista.id },
        {
          orderBy: { createdAt: 'DESC' },
          limit,
          populate: ['transferencista', 'transferencista.user'],
        }
      )
    }

    return giros.map((giro) => {
      let minoristaName: string | undefined
      let transferencistaNombre: string | undefined

      if (giro.minorista && wrap(giro.minorista).isInitialized()) {
        const minoristaUser = giro.minorista.user
        if (minoristaUser && wrap(minoristaUser).isInitialized()) {
          minoristaName = minoristaUser.fullName
        }
      }

      if (giro.transferencista && wrap(giro.transferencista).isInitialized()) {
        const transUser = giro.transferencista.user
        if (transUser && wrap(transUser).isInitialized()) {
          transferencistaNombre = transUser.fullName
        }
      }

      return {
        id: giro.id,
        beneficiaryName: giro.beneficiaryName,
        amountBs: Number(giro.amountBs),
        amountInput: Number(giro.amountInput),
        currencyInput: giro.currencyInput,
        status: giro.status,
        returnReason: giro.returnReason,
        createdAt: giro.createdAt,
        minoristaName,
        transferencistaNombre,
        bankName: giro.bankName,
        earnings: role === 'MINORISTA' ? Number(giro.minoristaProfit) : undefined,
      }
    })
  }
}
