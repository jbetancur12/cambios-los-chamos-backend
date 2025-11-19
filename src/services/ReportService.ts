import { DI } from '@/di'
import { GiroStatus } from '@/entities/Giro'
import { MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { BankAccountTransactionType } from '@/entities/BankAccountTransaction'

export interface SystemProfitReport {
  totalProfit: number
  totalGiros: number
  completedGiros: number
  averageProfitPerGiro: number
  profitByStatus: {
    status: string
    count: number
    totalProfit: number
  }[]
}

export interface ProfitTrendData {
  date: string
  profit: number
}

export interface SystemProfitTrendReport {
  trendData: ProfitTrendData[]
  totalProfit: number
  totalGiros: number
  completedGiros: number
  averageProfitPerGiro: number
}

export interface MinoriastaProfit {
  minoristaId: string
  minoristaName: string
  email: string
  totalProfit: number
  giroCount: number
  availableCredit: number
}

export interface TopMinoristaReport {
  minoristas: MinoriastaProfit[]
  totalMinoristas: number
}

export interface BankTransactionReport {
  totalTransactions: number
  totalDeposits: number
  totalWithdrawals: number
  totalAdjustments: number
  depositAmount: number
  withdrawalAmount: number
  adjustmentAmount: number
  netAmount: number
}

export interface MinoristaTransactionReport {
  totalTransactions: number
  recharges: number
  discounts: number
  adjustments: number
  profits: number
  totalRechargeAmount: number
  totalDiscountAmount: number
  totalAdjustmentAmount: number
  totalProfitAmount: number
}

export interface MinoristaGiroReport {
  totalMoneyTransferred: number
  totalProfit: number
  totalGiros: number
  completedGiros: number
  averageProfitPerGiro: number
  moneyTransferredByStatus: {
    status: string
    count: number
    totalAmount: number
    totalProfit: number
  }[]
}

export interface MinoristaGiroTrendData {
  date: string
  moneyTransferred: number
  profit: number
}

export interface MinoristaGiroTrendReport {
  trendData: MinoristaGiroTrendData[]
  totalMoneyTransferred: number
  totalProfit: number
  totalGiros: number
  completedGiros: number
  averageProfitPerGiro: number
}

export class ReportService {
  /**
   * Ajusta las fechas de UTC a la zona horaria local del servidor
   * Esto es necesario porque el cliente envía fechas en UTC pero la BD almacena en hora local
   * getTimezoneOffset() retorna negativos para timezones al OESTE de UTC (ej: UTC-5 retorna -300)
   * Para convertir de UTC a hora local, necesitamos SUMAR el offset
   */
  private adjustDatesForTimezone(dateFrom: Date, dateTo: Date): { adjustedFrom: Date; adjustedTo: Date } {
    const offsetMillis = new Date().getTimezoneOffset() * 60 * 1000
    const adjustedFrom = new Date(dateFrom.getTime() + offsetMillis)
    const adjustedTo = new Date(dateTo.getTime() + offsetMillis)
    return { adjustedFrom, adjustedTo }
  }

  /**
   * Calcula ganancias del sistema dentro de un rango de fechas
   */
  async getSystemProfitReport(dateFrom: Date, dateTo: Date): Promise<SystemProfitReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    console.log('Generating system profit report from', adjustedFrom, 'to', adjustedTo)
    const giros = await DI.giros.find({
      createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
    })

    const totalProfit = giros.reduce((sum, g) => sum + (g.systemProfit || 0), 0)
    const completedGiros = giros.filter((g) => g.status === GiroStatus.COMPLETADO).length
    const totalGiros = giros.length
    const averageProfitPerGiro = completedGiros > 0 ? totalProfit / completedGiros : 0

    // Group by status
    const statusMap = new Map<string, { count: number; profit: number }>()
    giros.forEach((g) => {
      const existing = statusMap.get(g.status) || { count: 0, profit: 0 }
      statusMap.set(g.status, {
        count: existing.count + 1,
        profit: existing.profit + (g.systemProfit || 0),
      })
    })

    const profitByStatus = Array.from(statusMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      totalProfit: data.profit,
    }))

    return {
      totalProfit,
      totalGiros,
      completedGiros,
      averageProfitPerGiro,
      profitByStatus,
    }
  }

  /**
   * Obtiene la tendencia de ganancias del sistema por fecha
   */
  async getSystemProfitTrendReport(dateFrom: Date, dateTo: Date): Promise<SystemProfitTrendReport> {
    const giros = await DI.giros.find({
      createdAt: { $gte: dateFrom, $lte: dateTo },
    })
    // Group by date
    const dateMap = new Map<string, number>()
    giros.forEach((g) => {
      const dateStr = g.createdAt.toISOString().split('T')[0]
      const existing = dateMap.get(dateStr) || 0
      dateMap.set(dateStr, existing + (g.systemProfit || 0))
    })

    // Convert to sorted array
    const trendData = Array.from(dateMap.entries())
      .map(([date, profit]) => ({
        date,
        profit,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const totalProfit = giros.reduce((sum, g) => sum + (g.systemProfit || 0), 0)
    const completedGiros = giros.filter((g) => g.status === GiroStatus.COMPLETADO).length
    const totalGiros = giros.length
    const averageProfitPerGiro = completedGiros > 0 ? totalProfit / completedGiros : 0

    return {
      trendData,
      totalProfit,
      totalGiros,
      completedGiros,
      averageProfitPerGiro,
    }
  }

  /**
   * Calcula ganancias de minoristas dentro de un rango de fechas
   */
  async getMinoristaProfitReport(dateFrom: Date, dateTo: Date, limit: number = 100): Promise<TopMinoristaReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    const minoristas = await DI.minoristas.find({}, { populate: ['user', 'giros'] })
    const minoristasProfits: MinoriastaProfit[] = []

    for (const minorista of minoristas) {
      const giros = await DI.giros.find({
        minorista: minorista.id,
        createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
      })

      const totalProfit = giros.reduce((sum, g) => sum + (g.minoristaProfit || 0), 0)

      minoristasProfits.push({
        minoristaId: minorista.id,
        minoristaName: minorista.user.fullName,
        email: minorista.user.email,
        totalProfit,
        giroCount: giros.length,
        availableCredit: minorista.availableCredit || 0,
      })
    }

    // Sort by totalProfit descending
    minoristasProfits.sort((a, b) => b.totalProfit - a.totalProfit)

    return {
      minoristas: minoristasProfits.slice(0, limit),
      totalMinoristas: minoristasProfits.length,
    }
  }

  /**
   * Obtiene transacciones bancarias dentro de un rango de fechas
   */
  async getBankTransactionReport(dateFrom: Date, dateTo: Date): Promise<BankTransactionReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    const transactions = await DI.bankAccountTransactions.find({
      createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
    })

    const deposits = transactions.filter((t: any) => t.type === BankAccountTransactionType.DEPOSIT)
    const withdrawals = transactions.filter((t: any) => t.type === BankAccountTransactionType.WITHDRAWAL)
    const adjustments = transactions.filter((t: any) => t.type === BankAccountTransactionType.ADJUSTMENT)

    const depositAmount = deposits.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
    const withdrawalAmount = withdrawals.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
    const adjustmentAmount = adjustments.reduce((sum: number, t: any) => {
      // Adjustments can be positive or negative
      return sum + (t.amount || 0)
    }, 0)

    const netAmount = depositAmount - withdrawalAmount + adjustmentAmount

    return {
      totalTransactions: transactions.length,
      totalDeposits: deposits.length,
      totalWithdrawals: withdrawals.length,
      totalAdjustments: adjustments.length,
      depositAmount,
      withdrawalAmount,
      adjustmentAmount,
      netAmount,
    }
  }

  /**
   * Obtiene transacciones de minoristas dentro de un rango de fechas
   */
  async getMinoristaTransactionReport(dateFrom: Date, dateTo: Date): Promise<MinoristaTransactionReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    const transactions = await DI.minoristaTransactions.find({
      createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
    })

    const recharges = transactions.filter((t) => t.type === MinoristaTransactionType.RECHARGE)
    const discounts = transactions.filter((t) => t.type === MinoristaTransactionType.DISCOUNT)
    const adjustments = transactions.filter((t) => t.type === MinoristaTransactionType.ADJUSTMENT)
    const profits = transactions.filter((t) => t.type === MinoristaTransactionType.PROFIT)

    const totalRechargeAmount = recharges.reduce((sum, t) => sum + (t.amount || 0), 0)
    const totalDiscountAmount = discounts.reduce((sum, t) => sum + (t.amount || 0), 0)
    const totalAdjustmentAmount = adjustments.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    const totalProfitAmount = profits.reduce((sum, t) => sum + (t.amount || 0), 0)

    return {
      totalTransactions: transactions.length,
      recharges: recharges.length,
      discounts: discounts.length,
      adjustments: adjustments.length,
      profits: profits.length,
      totalRechargeAmount,
      totalDiscountAmount,
      totalAdjustmentAmount,
      totalProfitAmount,
    }
  }

  /**
   * Obtiene reporte de giros para un minorista específico en un rango de fechas
   */
  async getMinoristaGiroReport(minoristaId: string, dateFrom: Date, dateTo: Date): Promise<MinoristaGiroReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    const giros = await DI.giros.find({
      minorista: minoristaId,
      createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
    })

    const totalMoneyTransferred = giros.reduce((sum, g) => sum + (g.amountBs || 0), 0)
    const totalProfit = giros.reduce((sum, g) => sum + (g.minoristaProfit || 0), 0)
    const completedGiros = giros.filter((g) => g.status === GiroStatus.COMPLETADO).length
    const totalGiros = giros.length
    const averageProfitPerGiro = completedGiros > 0 ? totalProfit / completedGiros : 0

    // Group by status
    const statusMap = new Map<string, { count: number; totalAmount: number; totalProfit: number }>()
    giros.forEach((g) => {
      const existing = statusMap.get(g.status) || { count: 0, totalAmount: 0, totalProfit: 0 }
      statusMap.set(g.status, {
        count: existing.count + 1,
        totalAmount: existing.totalAmount + (g.amountBs || 0),
        totalProfit: existing.totalProfit + (g.minoristaProfit || 0),
      })
    })

    const moneyTransferredByStatus = Array.from(statusMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      totalAmount: data.totalAmount,
      totalProfit: data.totalProfit,
    }))

    return {
      totalMoneyTransferred,
      totalProfit,
      totalGiros,
      completedGiros,
      averageProfitPerGiro,
      moneyTransferredByStatus,
    }
  }

  /**
   * Obtiene la tendencia de giros para un minorista específico en un rango de fechas
   */
  async getMinoristaGiroTrendReport(minoristaId: string, dateFrom: Date, dateTo: Date): Promise<MinoristaGiroTrendReport> {
    const { adjustedFrom, adjustedTo } = this.adjustDatesForTimezone(dateFrom, dateTo)
    const giros = await DI.giros.find({
      minorista: minoristaId,
      createdAt: { $gte: adjustedFrom, $lte: adjustedTo },
    })

    // Group by date
    const dateMap = new Map<string, { moneyTransferred: number; profit: number }>()
    giros.forEach((g) => {
      const dateStr = g.createdAt.toISOString().split('T')[0]
      const existing = dateMap.get(dateStr) || { moneyTransferred: 0, profit: 0 }
      dateMap.set(dateStr, {
        moneyTransferred: existing.moneyTransferred + (g.amountBs || 0),
        profit: existing.profit + (g.minoristaProfit || 0),
      })
    })

    // Convert to sorted array
    const trendData = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        moneyTransferred: data.moneyTransferred,
        profit: data.profit,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const totalMoneyTransferred = giros.reduce((sum, g) => sum + (g.amountBs || 0), 0)
    const totalProfit = giros.reduce((sum, g) => sum + (g.minoristaProfit || 0), 0)
    const completedGiros = giros.filter((g) => g.status === GiroStatus.COMPLETADO).length
    const totalGiros = giros.length
    const averageProfitPerGiro = completedGiros > 0 ? totalProfit / completedGiros : 0

    return {
      trendData,
      totalMoneyTransferred,
      totalProfit,
      totalGiros,
      completedGiros,
      averageProfitPerGiro,
    }
  }
}

export const reportService = new ReportService()
