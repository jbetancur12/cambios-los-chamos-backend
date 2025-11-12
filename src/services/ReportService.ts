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
  balance: number
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

export class ReportService {
  /**
   * Calcula ganancias del sistema dentro de un rango de fechas
   */
  async getSystemProfitReport(
    dateFrom: Date,
    dateTo: Date
  ): Promise<SystemProfitReport> {
    console.log('Generating system profit report from', dateFrom, 'to', dateTo)
    const giros = await DI.giros.find({
      createdAt: { $gte: dateFrom, $lte: dateTo },
    })

    const totalProfit = giros.reduce((sum, g) => sum + (g.systemProfit || 0), 0)
    const completedGiros = giros.filter((g) => g.status === GiroStatus.COMPLETADO).length
    const totalGiros = giros.length
    const averageProfitPerGiro = totalGiros > 0 ? totalProfit / completedGiros : 0

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
  async getSystemProfitTrendReport(
    dateFrom: Date,
    dateTo: Date
  ): Promise<SystemProfitTrendReport> {
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
    const averageProfitPerGiro = totalGiros > 0 ? totalProfit / completedGiros : 0

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
  async getMinoristaProfitReport(
    dateFrom: Date,
    dateTo: Date,
    limit: number = 100
  ): Promise<TopMinoristaReport> {
    const minoristas = await DI.minoristas.find({}, { populate: ['user', 'giros'] })
    const minoristasProfits: MinoriastaProfit[] = []

    for (const minorista of minoristas) {
      const giros = await DI.giros.find({
        minorista: minorista.id,
        createdAt: { $gte: dateFrom, $lte: dateTo },
      })

      const totalProfit = giros.reduce((sum, g) => sum + (g.minoristaProfit || 0), 0)

      minoristasProfits.push({
        minoristaId: minorista.id,
        minoristaName: minorista.user.fullName,
        email: minorista.user.email,
        totalProfit,
        giroCount: giros.length,
        balance: minorista.balance,
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
  async getBankTransactionReport(
    dateFrom: Date,
    dateTo: Date
  ): Promise<BankTransactionReport> {
    const transactions = await DI.bankAccountTransactions.find({
      createdAt: { $gte: dateFrom, $lte: dateTo },
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
  async getMinoristaTransactionReport(
    dateFrom: Date,
    dateTo: Date
  ): Promise<MinoristaTransactionReport> {
    const transactions = await DI.minoristaTransactions.find({
      createdAt: { $gte: dateFrom, $lte: dateTo },
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
}

export const reportService = new ReportService()
