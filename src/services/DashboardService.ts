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
    // Get "Now"
    const now = new Date()

    // Colombia (Bogotá) is UTC-5
    // We want to know "What day is it in Colombia?"
    // Shift current UTC time by -5 hours to simulate CO wall clock in a UTC date object
    const CO_OFFSET_MS = -5 * 60 * 60 * 1000
    const coNow = new Date(now.getTime() + CO_OFFSET_MS)

    // Calculate Start of Day in CO time (00:00:00.000)
    // We use UTC methods because coNow "pretends" to be UTC for the sake of extracting YYYY-MM-DD
    const coStartOfDay = new Date(coNow)
    coStartOfDay.setUTCHours(0, 0, 0, 0)

    // Calculate End of Day in CO time (Next day 00:00:00.000)
    const coEndOfDay = new Date(coStartOfDay)
    coEndOfDay.setUTCDate(coEndOfDay.getUTCDate() + 1)

    // Convert back to real UTC for Database Query
    // We add +5 hours to get the real UTC timestamp that corresponds to CO 00:00
    const dbStartToday = new Date(coStartOfDay.getTime() - CO_OFFSET_MS)
    const dbEndToday = new Date(coEndOfDay.getTime() - CO_OFFSET_MS)

    // Log for debugging
    console.log(`[DashboardService] Server Time (UTC): ${now.toISOString()}`)
    console.log(`[DashboardService] Colombia Time: ${coNow.toISOString().replace('Z', ' (CO)')}`)
    console.log(`[DashboardService] Query Start (UTC): ${dbStartToday.toISOString()} (= CO 00:00)`)
    console.log(`[DashboardService] Query End (UTC): ${dbEndToday.toISOString()} (= CO 24:00)`)

    // Use these for queries instead of local 'today'/'tomorrow'
    const today = dbStartToday
    const tomorrow = dbEndToday

    // Get current month range (Based on CO time)
    // Start of month in CO
    const coMonthStart = new Date(coNow)
    coMonthStart.setUTCDate(1)
    coMonthStart.setUTCHours(0, 0, 0, 0)

    // End of month in CO
    const coMonthEnd = new Date(coMonthStart)
    coMonthEnd.setUTCMonth(coMonthEnd.getUTCMonth() + 1)
    coMonthEnd.setUTCDate(0) // Last day of month
    coMonthEnd.setUTCHours(23, 59, 59, 999)

    // Convert month range to real UTC
    const monthStart = new Date(coMonthStart.getTime() - CO_OFFSET_MS)
    const monthEnd = new Date(coMonthEnd.getTime() - CO_OFFSET_MS)

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

      // Use calculated dates from above
      // const today = ...
      // const tomorrow = ...

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
