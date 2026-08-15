import { DI } from '@/di'
import { Credit, CreditStatus } from '@/entities/Credit'
import { Payment, PaymentMethod, PaymentStatus, PaymentType } from '@/entities/Payment'
import { CashBalance, CashBalanceStatus } from '@/entities/CashBalance'
import { creditService } from './CreditService'

export interface RegisterPaymentInput {
  creditId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentType?: PaymentType
  paymentDate?: string
  latitude?: number | null
  longitude?: number | null
  transactionId?: string
  cashBalanceId?: string | null
}

export class PaymentService {
  async registerPayment(
    input: RegisterPaymentInput,
    userId: string
  ): Promise<
    | {
        payment: Payment
        credit: Credit
        result: ReturnType<typeof creditService.processPayment>
      }
    | { error: 'CREDIT_NOT_FOUND' | 'CREDIT_CLOSED' | 'CASH_BALANCE_NOT_OPEN' }
  > {
    const credit = await DI.credits.findOne({ id: input.creditId }, { populate: ['client'] })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (credit.status === CreditStatus.PAID_OFF || credit.status === CreditStatus.CANCELLED) {
      return { error: 'CREDIT_CLOSED' }
    }

    let cashBalance: CashBalance | undefined
    if (input.cashBalanceId) {
      const found = await DI.cashBalances.findOne({ id: input.cashBalanceId })
      if (!found || found.status === 'closed') {
        return { error: 'CASH_BALANCE_NOT_OPEN' }
      }
      cashBalance = found as CashBalance
    } else {
      // Auto-vincular a la caja abierta de hoy del cobrador
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`
      const openBox = await DI.cashBalances.findOne({
        cobrador: userId,
        date: dateStr,
        status: CashBalanceStatus.OPEN,
      })
      if (openBox) {
        cashBalance = openBox as CashBalance
      }
    }

    const result = creditService.processPayment(credit, Number(input.amount))

    const schedule = await creditService.getPaymentSchedule(credit)
    const nextInstallment = schedule.find((s) => !s.is_paid)

    const userRef = DI.users.getReference(userId)

    const payment = DI.payments.create({
      credit,
      client: credit.client,
      cobrador: userRef,
      cashBalance: cashBalance ?? undefined,
      amount: Number(input.amount),
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      paymentMethod: input.paymentMethod,
      paymentType: input.paymentType ?? PaymentType.REGULAR,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      status: PaymentStatus.COMPLETED,
      transactionId: input.transactionId,
      installmentNumber: nextInstallment ? nextInstallment.installment_number : null,
      receivedBy: userRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(payment)
    await creditService.recalculateCreditFromPayments(credit)

    // Acumular el recaudo en la caja vinculada
    if (cashBalance) {
      cashBalance.collectedAmount = Number(cashBalance.collectedAmount) + Number(input.amount)
      cashBalance.finalAmount =
        Number(cashBalance.initialAmount) + Number(cashBalance.collectedAmount) - Number(cashBalance.lentAmount)
      await DI.em.persistAndFlush(cashBalance)
    }

    return { payment, credit, result }
  }

  async list(params: {
    status?: PaymentStatus
    paymentMethod?: PaymentMethod
    creditId?: string
    clientId?: string
    from?: string
    to?: string
    page?: number
    limit?: number
  }): Promise<{ items: Payment[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (params.status) where.status = params.status
    if (params.paymentMethod) where.paymentMethod = params.paymentMethod
    if (params.creditId) where.credit = params.creditId
    if (params.clientId) where.client = params.clientId
    if (params.from || params.to) {
      where.paymentDate = {} as { $gte?: Date; $lte?: Date }
      if (params.from) (where.paymentDate as { $gte?: Date }).$gte = new Date(params.from)
      if (params.to) (where.paymentDate as { $lte?: Date }).$lte = new Date(params.to)
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [items, total] = await DI.payments.findAndCount(where, {
      populate: ['credit', 'client', 'receivedBy'],
      orderBy: { paymentDate: 'DESC' },
      limit,
      offset,
    })

    return { items, total }
  }

  async getByCredit(creditId: string): Promise<Payment[]> {
    return DI.payments.find(
      { credit: creditId },
      { populate: ['receivedBy', 'cashBalance'], orderBy: { paymentDate: 'ASC' } }
    )
  }

  async getRecent(limit = 20): Promise<Payment[]> {
    return DI.payments.find(
      {},
      { populate: ['credit', 'client', 'receivedBy'], orderBy: { paymentDate: 'DESC' }, limit }
    )
  }

  async getTodaySummary(): Promise<{
    totalCollected: number
    paymentCount: number
    byMethod: { method: string; total: number; count: number }[]
  }> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)

    const payments = await DI.payments.find(
      {
        paymentDate: { $gte: today, $lt: tomorrow },
        status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
      },
      { fields: ['amount', 'paymentMethod'] }
    )

    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const methodMap = new Map<string, { total: number; count: number }>()
    for (const p of payments) {
      const entry = methodMap.get(p.paymentMethod) ?? { total: 0, count: 0 }
      entry.total += Number(p.amount)
      entry.count += 1
      methodMap.set(p.paymentMethod, entry)
    }

    return {
      totalCollected,
      paymentCount: payments.length,
      byMethod: Array.from(methodMap.entries()).map(([method, v]) => ({ method, total: v.total, count: v.count })),
    }
  }

  async remove(id: string, _userId: string): Promise<boolean | { error: 'PAYMENT_NOT_FOUND' }> {
    const payment = await DI.payments.findOne({ id }, { populate: ['credit', 'cashBalance'] })
    if (!payment) {
      return { error: 'PAYMENT_NOT_FOUND' }
    }

    // Restar del recaudo de la caja vinculada
    if (payment.cashBalance && payment.status !== PaymentStatus.CANCELLED) {
      payment.cashBalance.collectedAmount = Math.max(
        0,
        Number(payment.cashBalance.collectedAmount) - Number(payment.amount)
      )
      payment.cashBalance.finalAmount =
        Number(payment.cashBalance.initialAmount) +
        Number(payment.cashBalance.collectedAmount) -
        Number(payment.cashBalance.lentAmount)
      await DI.em.persistAndFlush(payment.cashBalance)
    }

    payment.status = PaymentStatus.CANCELLED
    await DI.em.persistAndFlush(payment)

    if (payment.credit) {
      await creditService.recalculateCreditFromPayments(payment.credit)
    }

    return true
  }
}

export const paymentService = new PaymentService()
