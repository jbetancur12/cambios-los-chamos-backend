import { DI } from '@/di'
import { CreditStatus } from '@/entities/Credit'
import { PaymentStatus } from '@/entities/Payment'
import { CashBalanceStatus } from '@/entities/CashBalance'
import { creditService } from './CreditService'

export class CobranzasDashboardService {
  async getStats(): Promise<{
    credits: Record<string, number>
    totalClients: number
    activeClients: number
    totalPortfolio: number
    totalCollectedToday: number
    paymentsToday: number
    overdueAmount: number
    requiringAttention: number
    openCashBalance: number
    pendingClosures: number
  }> {
    const statuses = await DI.credits.find({}, { fields: ['status', 'balance'] })

    const credits: Record<string, number> = {}
    let totalPortfolio = 0
    let overdueAmount = 0
    let requiringAttention = 0

    for (const credit of statuses) {
      credits[credit.status] = (credits[credit.status] ?? 0) + 1
      if (credit.status === CreditStatus.ACTIVE) {
        totalPortfolio += Number(credit.balance)
      }
    }

    const attentionCredits = await DI.credits.find({ status: CreditStatus.ACTIVE })
    for (const credit of attentionCredits) {
      if (await creditService.getRequiresAttention(credit)) {
        requiringAttention++
        overdueAmount += await creditService.getOverdueAmount(credit)
      }
    }

    const [totalClients, activeClients] = await Promise.all([
      DI.cobranzaClients.count(),
      DI.cobranzaClients.count({ isActive: true }),
    ])

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)

    const todayPayments = await DI.payments.find(
      {
        paymentDate: { $gte: today, $lt: tomorrow },
        status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
      },
      { fields: ['amount'] }
    )
    const totalCollectedToday = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0)

    const openCashBalance = await DI.cashBalances.count({ status: CashBalanceStatus.OPEN })
    const pendingClosures = await DI.cashBalances.count({
      status: CashBalanceStatus.OPEN,
      date: { $lt: this.toDateStr(new Date()) },
    })

    return {
      credits,
      totalClients,
      activeClients,
      totalPortfolio,
      totalCollectedToday,
      paymentsToday: todayPayments.length,
      overdueAmount,
      requiringAttention,
      openCashBalance,
      pendingClosures,
    }
  }

  private toDateStr(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  async getRecentActivity(limit = 15): Promise<{
    payments: { id: string; clientName: string; amount: number; paymentDate: Date; paymentMethod: string }[]
    newCredits: { id: string; clientName: string; amount: number; createdAt: Date; status: string }[]
  }> {
    const payments = await DI.payments.find({}, { populate: ['client'], orderBy: { createdAt: 'DESC' }, limit })
    const newCredits = await DI.credits.find({}, { populate: ['client'], orderBy: { createdAt: 'DESC' }, limit })

    return {
      payments: payments.map((p) => ({
        id: p.id,
        clientName: p.client.name,
        amount: Number(p.amount),
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
      })),
      newCredits: newCredits.map((c) => ({
        id: c.id,
        clientName: c.client.name,
        amount: Number(c.amount),
        createdAt: c.createdAt,
        status: c.status,
      })),
    }
  }

  async getFinancialSummary(): Promise<{
    totalFinanced: number
    totalCollected: number
    outstanding: number
    defaultedAmount: number
    monthlyCollected: { month: string; total: number }[]
  }> {
    const allCredits = await DI.credits.find({}, { fields: ['amount', 'balance', 'totalPaid', 'status'] })

    let totalFinanced = 0
    let totalCollected = 0
    let outstanding = 0
    let defaultedAmount = 0

    for (const credit of allCredits) {
      totalFinanced += Number(credit.amount)
      totalCollected += Number(credit.totalPaid ?? 0)
      if (credit.status === CreditStatus.ACTIVE) {
        outstanding += Number(credit.balance)
      }
      if (credit.status === CreditStatus.DEFAULTED) {
        defaultedAmount += Number(credit.balance)
      }
    }

    const firstDay = new Date()
    firstDay.setDate(1)
    firstDay.setHours(0, 0, 0, 0)

    const monthlyPayments = await DI.payments.find(
      {
        paymentDate: { $gte: firstDay },
        status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
      },
      { fields: ['amount', 'paymentDate'] }
    )

    const monthMap = new Map<string, number>()
    for (const p of monthlyPayments) {
      const key = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, (monthMap.get(key) ?? 0) + Number(p.amount))
    }

    return {
      totalFinanced,
      totalCollected,
      outstanding,
      defaultedAmount,
      monthlyCollected: Array.from(monthMap.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    }
  }
}

export const cobranzasDashboardService = new CobranzasDashboardService()
