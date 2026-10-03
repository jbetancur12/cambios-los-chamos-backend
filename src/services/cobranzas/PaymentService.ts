import { DI } from '@/di'
import { CreditStatus } from '@/entities/Credit'
import { Payment, PaymentMethod, PaymentStatus } from '@/entities/Payment'
import { creditService, CreditView } from './CreditService'

export interface RegisterPaymentInput {
  creditId: string
  amount: number
  paymentMethod: PaymentMethod
  paymentDate?: string
}

export class PaymentService {
  async registerPayment(
    input: RegisterPaymentInput,
    userId: string
  ): Promise<
    | {
        payment: Payment
        credit: CreditView
        coverage: { installmentsCovered: number; remainingBalance: number }
      }
    | { error: 'CREDIT_NOT_FOUND' | 'CREDIT_CLOSED' | 'EXCEEDS_BALANCE' }
  > {
    const credit = await DI.credits.findOne({ id: input.creditId }, { populate: ['client'] })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (credit.status !== CreditStatus.ACTIVE) {
      return { error: 'CREDIT_CLOSED' }
    }
    if (Number(input.amount) > Number(credit.balance) + 0.5) {
      return { error: 'EXCEEDS_BALANCE' }
    }

    const installmentsBefore = creditService.toView(credit).paidInstallments

    const userRef = DI.users.getReference(userId)
    const payment = DI.payments.create({
      credit,
      client: credit.client,
      amount: Number(input.amount),
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      paymentMethod: input.paymentMethod,
      status: PaymentStatus.COMPLETED,
      receivedBy: userRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(payment)
    await creditService.recalculateFromPayments(credit)

    const view = creditService.toView(credit)
    return {
      payment,
      credit: view,
      coverage: {
        installmentsCovered: Math.max(0, view.paidInstallments - installmentsBefore),
        remainingBalance: view.balance,
      },
    }
  }

  async list(params: {
    creditId?: string
    clientId?: string
    from?: string
    to?: string
    page?: number
    limit?: number
  }): Promise<{ items: Payment[]; total: number }> {
    const where: Record<string, unknown> = { status: PaymentStatus.COMPLETED }
    if (params.creditId) where.credit = params.creditId
    if (params.clientId) where.client = params.clientId
    if (params.from || params.to) {
      const range: { $gte?: Date; $lte?: Date } = {}
      if (params.from) range.$gte = new Date(params.from)
      if (params.to) range.$lte = new Date(params.to)
      where.paymentDate = range
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [items, total] = await DI.payments.findAndCount(where, {
      populate: ['credit', 'client'],
      orderBy: { paymentDate: 'DESC' },
      limit,
      offset,
    })
    return { items, total }
  }

  /** Anula el pago y recalcula el préstamo. */
  async remove(id: string): Promise<true | { error: 'PAYMENT_NOT_FOUND' }> {
    const payment = await DI.payments.findOne({ id }, { populate: ['credit'] })
    if (!payment) {
      return { error: 'PAYMENT_NOT_FOUND' }
    }

    payment.status = PaymentStatus.CANCELLED
    await DI.em.persistAndFlush(payment)
    await creditService.recalculateFromPayments(payment.credit)
    return true
  }
}

export const paymentService = new PaymentService()
