import { DI } from '@/di'
import { CashBalance, CashBalanceStatus } from '@/entities/CashBalance'
import { PaymentStatus } from '@/entities/Payment'
import { CreditStatus } from '@/entities/Credit'

export class CashBalanceService {
  async getCurrentStatus(cobradorId: string): Promise<CashBalance | null> {
    const today = this.toDateStr(new Date())
    return DI.cashBalances.findOne({ cobrador: cobradorId, date: today }, { populate: ['cobrador'] })
  }

  private toDateStr(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  async open(
    cobradorId: string,
    input: { initialAmount?: number; date?: string; notes?: string }
  ): Promise<CashBalance | { error: 'ALREADY_OPEN' }> {
    const date = input.date ?? this.toDateStr(new Date())

    const existing = await DI.cashBalances.findOne({ cobrador: cobradorId, date })
    if (existing && existing.status === CashBalanceStatus.OPEN) {
      return { error: 'ALREADY_OPEN' }
    }

    const cobrador = DI.users.getReference(cobradorId)
    const balance = DI.cashBalances.create({
      cobrador,
      date,
      initialAmount: input.initialAmount ?? 0,
      collectedAmount: 0,
      lentAmount: 0,
      finalAmount: input.initialAmount ?? 0,
      status: CashBalanceStatus.OPEN,
      closureNotes: input.notes,
      requiresReconciliation: false,
      hasPendingPreviousBoxes: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(balance)
    return balance
  }

  async list(params: {
    from?: string
    to?: string
    status?: CashBalanceStatus
    page?: number
    limit?: number
  }): Promise<{
    items: CashBalance[]
    total: number
  }> {
    const where: Record<string, unknown> = {}
    if (params.status) where.status = params.status
    if (params.from || params.to) {
      where.date = {} as { $gte?: string; $lte?: string }
      if (params.from) (where.date as { $gte?: string }).$gte = params.from
      if (params.to) (where.date as { $lte?: string }).$lte = params.to
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [items, total] = await DI.cashBalances.findAndCount(where, {
      populate: ['cobrador', 'closedBy'],
      orderBy: { date: 'DESC' },
      limit,
      offset,
    })

    return { items, total }
  }

  async getById(id: string): Promise<CashBalance | null> {
    return DI.cashBalances.findOne({ id }, { populate: ['cobrador', 'closedBy'] })
  }

  async getPendingClosures(): Promise<CashBalance[]> {
    return DI.cashBalances.find(
      {
        status: CashBalanceStatus.OPEN,
        date: { $lt: this.toDateStr(new Date()) },
      },
      { populate: ['cobrador'], orderBy: { date: 'ASC' } }
    )
  }

  async autoCalculateCollected(id: string): Promise<CashBalance | { error: 'BALANCE_NOT_FOUND' | 'BALANCE_CLOSED' }> {
    const balance = await DI.cashBalances.findOne({ id })
    if (!balance) {
      return { error: 'BALANCE_NOT_FOUND' }
    }
    if (balance.status === CashBalanceStatus.CLOSED) {
      return { error: 'BALANCE_CLOSED' }
    }

    const dateStart = new Date(`${balance.date}T00:00:00`)
    const dateEnd = new Date(`${balance.date}T23:59:59.999`)

    const completedPayments = await DI.payments.find({
      cobrador: balance.cobrador,
      paymentDate: { $gte: dateStart, $lte: dateEnd },
      status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
    })

    const collected = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    balance.collectedAmount = collected
    balance.finalAmount = Number(balance.initialAmount) + collected - Number(balance.lentAmount)

    await DI.em.persistAndFlush(balance)
    return balance
  }

  async close(
    id: string,
    closedById: string,
    input: { lentAmount?: number; notes?: string; requiresReconciliation?: boolean }
  ): Promise<CashBalance | { error: 'BALANCE_NOT_FOUND' | 'BALANCE_CLOSED' }> {
    const balance = await DI.cashBalances.findOne({ id })
    if (!balance) {
      return { error: 'BALANCE_NOT_FOUND' }
    }
    if (balance.status === CashBalanceStatus.CLOSED) {
      return { error: 'BALANCE_CLOSED' }
    }

    if (input.lentAmount !== undefined) {
      balance.lentAmount = input.lentAmount
    }

    await this.autoCalculateCollected(id)

    balance.finalAmount = Number(balance.initialAmount) + Number(balance.collectedAmount) - Number(balance.lentAmount)
    balance.status = CashBalanceStatus.CLOSED
    balance.manuallyClosedAt = new Date()
    balance.closedBy = DI.users.getReference(closedById)
    balance.closureNotes = input.notes ?? balance.closureNotes
    balance.requiresReconciliation = input.requiresReconciliation ?? false

    await DI.em.persistAndFlush(balance)
    return balance
  }

  async getDetailedBalance(id: string): Promise<
    | {
        balance: CashBalance
        payments: {
          id: string
          clientName: string
          amount: number
          paymentDate: Date
          paymentMethod: string
          creditId: string
        }[]
        openCreditsCount: number
      }
    | { error: 'BALANCE_NOT_FOUND' }
  > {
    const balance = await DI.cashBalances.findOne({ id }, { populate: ['cobrador', 'closedBy'] })
    if (!balance) {
      return { error: 'BALANCE_NOT_FOUND' }
    }

    const dateStart = new Date(`${balance.date}T00:00:00`)
    const dateEnd = new Date(`${balance.date}T23:59:59.999`)

    const payments = await DI.payments.find(
      {
        cobrador: balance.cobrador,
        paymentDate: { $gte: dateStart, $lte: dateEnd },
        status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
      },
      { populate: ['client', 'credit'], orderBy: { paymentDate: 'ASC' } }
    )

    const openCreditsCount = await DI.credits.count({
      status: { $in: [CreditStatus.ACTIVE, CreditStatus.WAITING_DELIVERY, CreditStatus.PENDING_APPROVAL] },
    })

    return {
      balance,
      payments: payments.map((p) => ({
        id: p.id,
        clientName: p.client.name,
        amount: Number(p.amount),
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        creditId: p.credit.id,
      })),
      openCreditsCount,
    }
  }
}

export const cashBalanceService = new CashBalanceService()
