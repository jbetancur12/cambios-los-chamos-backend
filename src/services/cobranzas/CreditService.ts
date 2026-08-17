import { DI } from '@/di'
import { Credit, CreditFrequency, CreditStatus } from '@/entities/Credit'
import { PaymentStatus } from '@/entities/Payment'
import { CreditFollowUp } from '@/entities/CreditFollowUp'
export interface CreateCreditInput {
  clientId: string
  cobradorId?: string | null
  amount: number
  balance?: number
  frequency: CreditFrequency
  startDate: string
  endDate?: string
  status?: CreditStatus
  scheduledDeliveryDate?: string | null
  immediateDeliveryRequested?: boolean
  interestRate?: number
  totalInstallments?: number | null
  description?: string
  downPayment?: number | null
  isCustomCredit?: boolean
  calcOnRemainingAmount?: boolean
  isLegacyCredit?: boolean
  latitude?: number | null
  longitude?: number | null
}

interface ScheduleItem {
  installment_number: number
  due_date: string
  amount: number
  paid_amount: number
  remaining_amount: number
  is_paid: boolean
  is_partial: boolean
  status: 'paid' | 'partial' | 'overdue' | 'pending'
  payment_count: number
  last_payment_date: string | null
  payment_method: string | null
  received_by_name: string | null
  payment_id: string | null
}

export class CreditService {
  // ------------------------------------------------------------------
  // Helpers de cálculo (portados del modelo original)
  // ------------------------------------------------------------------

  private getPeriodDays(frequency: CreditFrequency): number {
    return {
      [CreditFrequency.DAILY]: 1,
      [CreditFrequency.WEEKLY]: 7,
      [CreditFrequency.BIWEEKLY]: 15,
      [CreditFrequency.MONTHLY]: 30,
    }[frequency] ?? 1
  }

  private toDateStr(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  calculateTotalInstallments(credit: Credit): number {
    if (credit.totalInstallments && Number(credit.totalInstallments) > 0) {
      return Number(credit.totalInstallments)
    }

    const start = new Date(credit.startDate + 'T00:00:00')
    const end = credit.endDate ? new Date(credit.endDate + 'T00:00:00') : new Date(start)
    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000)

    switch (credit.frequency) {
      case CreditFrequency.DAILY:
        return diffDays
      case CreditFrequency.WEEKLY:
        return Math.floor(diffDays / 7)
      case CreditFrequency.BIWEEKLY:
        return Math.floor(diffDays / 14) + 1
      case CreditFrequency.MONTHLY:
        return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()))
      default:
        return 0
    }
  }

  calculateTotalAmount(credit: Credit): number {
    const financedAmount = Number(credit.amount) - Number(credit.downPayment ?? 0)
    const rate = Number(credit.interestRate ?? 0)
    return financedAmount + financedAmount * (rate / 100)
  }

  calculateInstallmentAmount(credit: Credit): number {
    const totalInstallments = this.calculateTotalInstallments(credit)
    const totalAmount = Number(credit.totalAmount ?? this.calculateTotalAmount(credit))
    return totalInstallments > 0 ? totalAmount / totalInstallments : totalAmount
  }

  getFinancedAmount(credit: Credit): number {
    return Number(credit.amount) - Number(credit.downPayment ?? 0)
  }

  calculateEndDate(startDate: Date, credit: Credit): Date {
    const totalInstallments = Number(credit.totalInstallments ?? 0)
    if (totalInstallments <= 0) {
      return new Date(startDate.getTime() + 30 * 86400000)
    }

    const periodDays = this.getPeriodDays(credit.frequency)
    return new Date(startDate.getTime() + (totalInstallments - 1) * periodDays * 86400000)
  }

  async getPaymentSchedule(credit: Credit): Promise<ScheduleItem[]> {
    const startDate = new Date(credit.startDate + 'T00:00:00')
    const totalInstallments = this.calculateTotalInstallments(credit)
    const installmentAmount = Number(credit.installmentAmount ?? this.calculateInstallmentAmount(credit))

    const payments = await DI.payments.find(
      { credit: credit.id, status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] } },
      { populate: ['receivedBy'], orderBy: { paymentDate: 'ASC' } }
    )

    // Pago acumulado: un pago puede cubrir varias cuotas.
    // La cuota i está pagada si el total pagado alcanza i × monto de cuota.
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const lastPayment = payments[payments.length - 1]

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const periodDays = this.getPeriodDays(credit.frequency)

    const schedule: ScheduleItem[] = []

    for (let i = 0; i < totalInstallments; i++) {
      const installmentNumber = i + 1
      const currentDueDate = new Date(startDate.getTime() + i * periodDays * 86400000)

      const coveredBy = Math.min(Number(installmentAmount), Math.max(0, totalPaid - i * Number(installmentAmount)))
      const paidAmount = coveredBy
      const remaining = Number(installmentAmount) - paidAmount
      const isPaid = paidAmount >= Number(installmentAmount) - 0.001
      const isPartial = paidAmount > 0.001 && paidAmount < Number(installmentAmount) - 0.001

      let status: ScheduleItem['status'] = 'pending'
      if (isPaid) {
        status = 'paid'
      } else if (isPartial) {
        status = 'partial'
      } else if (currentDueDate.getTime() < today.getTime()) {
        status = 'overdue'
      }

      schedule.push({
        installment_number: installmentNumber,
        due_date: this.toDateStr(currentDueDate),
        amount: Number(installmentAmount),
        paid_amount: paidAmount,
        remaining_amount: Math.max(0, remaining),
        is_paid: isPaid,
        is_partial: isPartial,
        status,
        payment_count: payments.length,
        last_payment_date: lastPayment ? lastPayment.paymentDate.toISOString() : null,
        payment_method: lastPayment ? lastPayment.paymentMethod : null,
        received_by_name: lastPayment?.receivedBy ? lastPayment.receivedBy.fullName : null,
        payment_id: lastPayment ? lastPayment.id : null,
      })
    }

    return schedule
  }

  async getExpectedInstallments(credit: Credit): Promise<number> {
    const startDate = new Date(credit.startDate + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (today.getTime() < startDate.getTime()) {
      return 0
    }

    const schedule = await this.getPaymentSchedule(credit)
    let expectedCount = 0
    for (const installment of schedule) {
      const dueDate = new Date(installment.due_date + 'T00:00:00')
      if (dueDate.getTime() <= today.getTime()) {
        expectedCount++
      } else {
        break
      }
    }
    return expectedCount
  }

  async getCompletedInstallmentsCount(credit: Credit): Promise<number> {
    if (credit.paidInstallmentsCount !== undefined && credit.paidInstallmentsCount !== null) {
      return Number(credit.paidInstallmentsCount)
    }
    const schedule = await this.getPaymentSchedule(credit)
    return schedule.filter((s) => s.is_paid).length
  }

  async isOverdue(credit: Credit): Promise<boolean> {
    const expected = await this.getExpectedInstallments(credit)
    const completed = await this.getCompletedInstallmentsCount(credit)
    return completed < expected
  }

  async getOverdueAmount(credit: Credit): Promise<number> {
    if (!(await this.isOverdue(credit))) {
      return 0
    }
    const expected = await this.getExpectedInstallments(credit)
    const completed = await this.getCompletedInstallmentsCount(credit)
    const overdueInstallments = expected - completed
    const installmentAmount = Number(credit.installmentAmount ?? this.calculateInstallmentAmount(credit))
    return overdueInstallments * installmentAmount
  }

  async getDaysOverdue(credit: Credit): Promise<number> {
    if (credit.status === CreditStatus.PAID_OFF || !(await this.isOverdue(credit))) {
      return 0
    }
    const expected = await this.getExpectedInstallments(credit)
    const completed = await this.getCompletedInstallmentsCount(credit)
    const overdueInstallments = expected - completed
    const daysPerInstallment =
      {
        [CreditFrequency.DAILY]: 1,
        [CreditFrequency.WEEKLY]: 7,
        [CreditFrequency.BIWEEKLY]: 14,
        [CreditFrequency.MONTHLY]: 30,
      }[credit.frequency] ?? 1
    return overdueInstallments * daysPerInstallment
  }

  async getOverdueSeverity(credit: Credit): Promise<'none' | 'light' | 'moderate' | 'critical'> {
    const days = await this.getDaysOverdue(credit)
    if (days === 0) return 'none'
    if (days <= 3) return 'light'
    if (days <= 7) return 'moderate'
    return 'critical'
  }

  async getRequiresAttention(credit: Credit): Promise<boolean> {
    const severity = await this.getOverdueSeverity(credit)
    return severity === 'moderate' || severity === 'critical'
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async createCredit(input: CreateCreditInput, userId: string): Promise<Credit | { error: string }> {
    const client = await DI.cobranzaClients.findOne({ id: input.clientId })
    if (!client) {
      return { error: 'CLIENT_NOT_FOUND' }
    }
    if (!client.isActive) {
      return { error: 'CLIENT_INACTIVE' }
    }

    const freqConfig = await DI.loanFrequencies.findOne({ code: input.frequency })
    if (!freqConfig || !freqConfig.isEnabled) {
      return { error: 'FREQUENCY_DISABLED' }
    }

    let totalInstallments = input.totalInstallments
    if (!totalInstallments || Number(totalInstallments) <= 0) {
      if (freqConfig.isFixedDuration && freqConfig.fixedInstallments) {
        totalInstallments = freqConfig.fixedInstallments
      } else if (input.endDate) {
        const start = new Date(input.startDate + 'T00:00:00')
        const end = new Date(input.endDate + 'T00:00:00')
        const temp = this.calculateTotalInstallmentsByFrequency(start, end, input.frequency)
        totalInstallments = temp
      } else {
        totalInstallments = freqConfig.defaultInstallments ?? 1
      }
    }

    const interestRate = input.interestRate ?? freqConfig.interestRate ?? 0
    const financedAmount = Number(input.amount) - Number(input.downPayment ?? 0)
    const totalAmount = financedAmount + financedAmount * (interestRate / 100)
    const installmentAmount = Number(totalInstallments) > 0 ? totalAmount / Number(totalInstallments) : totalAmount

    // Auto-calcular fecha de finalización si no viene (según frecuencia + cuotas, omitiendo domingos)
    let endDate = input.endDate
    if (!endDate && input.startDate && Number(totalInstallments) > 0) {
      const temp = {
        totalInstallments: Number(totalInstallments),
        frequency: input.frequency,
      } as Credit
      endDate = this.toDateStr(this.calculateEndDate(new Date(`${input.startDate}T00:00:00`), temp))
    }

    const userRef = DI.users.getReference(userId)
    let cobradorRef = userRef
    if (input.cobradorId) {
      const cobrador = await DI.users.findOne({ id: input.cobradorId })
      if (cobrador) {
        cobradorRef = cobrador
      }
    }

    const credit = DI.credits.create({
      client,
      cobrador: cobradorRef,
      createdBy: userRef,
      amount: Number(input.amount),
      balance: input.balance !== undefined ? Number(input.balance) : totalAmount,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate,
      status: input.status ?? CreditStatus.PENDING_APPROVAL,
      interestRate,
      totalAmount,
      installmentAmount,
      totalInstallments: Number(totalInstallments),
      paidInstallmentsCount: 0,
      totalPaid: 0,
      scheduledDeliveryDate: input.scheduledDeliveryDate ? new Date(input.scheduledDeliveryDate) : undefined,
      immediateDeliveryRequested: input.immediateDeliveryRequested ?? false,
      isLegacyCredit: input.isLegacyCredit ?? false,
      isCustomCredit: input.isCustomCredit ?? false,
      firstPaymentToday: false,
      description: input.description,
      downPayment: input.downPayment ?? undefined,
      calcOnRemainingAmount: input.calcOnRemainingAmount ?? false,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(credit)
    return credit
  }

  private calculateTotalInstallmentsByFrequency(start: Date, end: Date, frequency: CreditFrequency): number {
    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000)
    switch (frequency) {
      case CreditFrequency.DAILY:
        return diffDays
      case CreditFrequency.WEEKLY:
        return Math.floor(diffDays / 7)
      case CreditFrequency.BIWEEKLY:
        return Math.floor(diffDays / 14) + 1
      case CreditFrequency.MONTHLY:
        return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()))
      default:
        return 1
    }
  }

  async getWaitingList(): Promise<{
    pendingApproval: Credit[]
    waitingDelivery: Credit[]
    readyToday: Credit[]
    overdueDelivery: Credit[]
    counts: { pendingApproval: number; waitingDelivery: number; readyToday: number; overdueDelivery: number }
  }> {
    const pendingApproval = await DI.credits.find(
      { status: CreditStatus.PENDING_APPROVAL },
      { populate: ['client', 'createdBy'], orderBy: { createdAt: 'ASC' } }
    )

    const waitingDelivery = await DI.credits.find(
      { status: CreditStatus.WAITING_DELIVERY },
      { populate: ['client', 'approvedBy'], orderBy: { scheduledDeliveryDate: 'ASC' } }
    )

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const readyToday = waitingDelivery.filter(
      (c) => c.scheduledDeliveryDate && c.scheduledDeliveryDate.getTime() >= todayStart.getTime()
    )
    const overdueDelivery = waitingDelivery.filter(
      (c) => c.scheduledDeliveryDate && c.scheduledDeliveryDate.getTime() < todayStart.getTime()
    )

    return {
      pendingApproval,
      waitingDelivery,
      readyToday,
      overdueDelivery,
      counts: {
        pendingApproval: pendingApproval.length,
        waitingDelivery: waitingDelivery.length,
        readyToday: readyToday.length,
        overdueDelivery: overdueDelivery.length,
      },
    }
  }

  async listCredits(params: {
    status?: CreditStatus
    frequency?: CreditFrequency
    clientId?: string
    search?: string
    requiringAttention?: boolean
    page?: number
    limit?: number
  }): Promise<{ items: Credit[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (params.status) where.status = params.status
    if (params.frequency) where.frequency = params.frequency
    if (params.clientId) where.client = params.clientId
    if (params.search) {
      const clients = await DI.cobranzaClients.find({
        $or: [{ name: { $ilike: `%${params.search}%` } }, { identification: { $ilike: `%${params.search}%` } }],
      })
      where.client = { $in: clients.map((c) => c.id) }
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit

    const [items, total] = await DI.credits.findAndCount(where, {
      populate: ['client', 'client.category', 'createdBy'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset,
    })

    if (params.requiringAttention) {
      const filtered: Credit[] = []
      for (const credit of items) {
        if (await this.getRequiresAttention(credit)) {
          filtered.push(credit)
        }
      }
      return { items: filtered, total: filtered.length }
    }

    return { items, total }
  }

  async getCreditDetail(id: string): Promise<
    | {
        credit: Credit
        schedule: ScheduleItem[]
        stats: {
          totalInstallments: number
          completedInstallments: number
          pendingInstallments: number
          expectedInstallments: number
          overdueInstallments: number
          isOverdue: boolean
          overdueAmount: number
          daysOverdue: number
          severity: 'none' | 'light' | 'moderate' | 'critical'
          requiresAttention: boolean
          financedAmount: number
          totalPaid: number
        }
      }
    | { error: 'CREDIT_NOT_FOUND' }
  > {
    const credit = await DI.credits.findOne(
      { id },
      { populate: ['client', 'client.category', 'createdBy', 'approvedBy', 'deliveredBy', 'cobrador', 'cashBalance'] }
    )
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }

    const schedule = await this.getPaymentSchedule(credit)
    const completedInstallments = await this.getCompletedInstallmentsCount(credit)
    const expectedInstallments = await this.getExpectedInstallments(credit)
    const totalInstallments = this.calculateTotalInstallments(credit)
    const overdueInstallments = Math.max(0, expectedInstallments - completedInstallments)
    const isOverdueFlag = await this.isOverdue(credit)

    const stats = {
      totalInstallments,
      completedInstallments,
      pendingInstallments: Math.max(0, totalInstallments - completedInstallments),
      expectedInstallments,
      overdueInstallments,
      isOverdue: isOverdueFlag,
      overdueAmount: await this.getOverdueAmount(credit),
      daysOverdue: await this.getDaysOverdue(credit),
      severity: await this.getOverdueSeverity(credit),
      requiresAttention: await this.getRequiresAttention(credit),
      financedAmount: this.getFinancedAmount(credit),
      totalPaid: Number(credit.totalPaid ?? 0),
    }

    return { credit, schedule, stats }
  }

  async updateCredit(id: string, data: Partial<CreateCreditInput>): Promise<Credit | { error: 'CREDIT_NOT_FOUND' }> {
    const credit = await DI.credits.findOne({ id })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }

    if (data.amount !== undefined) credit.amount = Number(data.amount)
    if (data.balance !== undefined) credit.balance = Number(data.balance)
    if (data.frequency !== undefined) credit.frequency = data.frequency
    if (data.startDate !== undefined) credit.startDate = data.startDate
    if (data.endDate !== undefined) credit.endDate = data.endDate
    if (data.status !== undefined) credit.status = data.status
    if (data.interestRate !== undefined) credit.interestRate = Number(data.interestRate)
    if (data.totalInstallments !== undefined) credit.totalInstallments = Number(data.totalInstallments) || undefined
    if (data.downPayment !== undefined) credit.downPayment = data.downPayment ?? undefined
    if (data.description !== undefined) credit.description = data.description

    if (data.scheduledDeliveryDate !== undefined) {
      credit.scheduledDeliveryDate = data.scheduledDeliveryDate ? new Date(data.scheduledDeliveryDate) : undefined
    }

    // Recalcular total/cuota/saldo si cambian monto, interés, anticipo o cuotas antes de la entrega
    const editable = [CreditStatus.PENDING_APPROVAL, CreditStatus.WAITING_DELIVERY].includes(credit.status)
    const recompute = ['amount', 'downPayment', 'interestRate', 'totalInstallments', 'frequency'].some((k) => k in data)
    if (editable && recompute) {
      const financed = Number(credit.amount) - Number(credit.downPayment ?? 0)
      const totalAmount = financed + financed * (Number(credit.interestRate ?? 0) / 100)
      const installments = Number(credit.totalInstallments ?? 0)
      credit.totalAmount = totalAmount
      credit.installmentAmount = installments > 0 ? totalAmount / installments : totalAmount
      if (data.balance === undefined) {
        credit.balance = totalAmount
      }
    }

    await DI.em.persistAndFlush(credit)
    return credit
  }

  // ------------------------------------------------------------------
  // Flujo de aprobación / entrega
  // ------------------------------------------------------------------

  async approveForDelivery(
    id: string,
    approvedById: string,
    scheduledDate: string,
    notes?: string
  ): Promise<Credit | { error: 'CREDIT_NOT_FOUND' | 'INVALID_STATUS' }> {
    const credit = await DI.credits.findOne({ id })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (credit.status !== CreditStatus.PENDING_APPROVAL) {
      return { error: 'INVALID_STATUS' }
    }

    credit.status = CreditStatus.WAITING_DELIVERY
    credit.approvedBy = DI.users.getReference(approvedById)
    credit.approvedAt = new Date()
    credit.scheduledDeliveryDate = new Date(scheduledDate)
    if (notes) {
      credit.deliveryNotes = notes
    }

    await DI.em.persistAndFlush(credit)
    return credit
  }

  async reject(
    id: string,
    rejectedById: string,
    reason: string
  ): Promise<Credit | { error: 'CREDIT_NOT_FOUND' | 'INVALID_STATUS' }> {
    const credit = await DI.credits.findOne({ id })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (![CreditStatus.PENDING_APPROVAL, CreditStatus.WAITING_DELIVERY].includes(credit.status)) {
      return { error: 'INVALID_STATUS' }
    }

    credit.status = CreditStatus.CANCELLED
    credit.rejectionReason = reason
    credit.approvedBy = DI.users.getReference(rejectedById)
    credit.approvedAt = new Date()

    await DI.em.persistAndFlush(credit)
    return credit
  }

  async deliverToClient(
    id: string,
    deliveredById: string,
    notes?: string,
    _firstPaymentToday = false
  ): Promise<Credit | { error: 'CREDIT_NOT_FOUND' | 'INVALID_STATUS' }> {
    const credit = await DI.credits.findOne({ id })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (credit.status !== CreditStatus.WAITING_DELIVERY) {
      return { error: 'INVALID_STATUS' }
    }

    const deliveredAt = new Date()

    // Base de la entrega: la fecha programada definida al crear (puede ser pasada = retrasada),
    // o el momento real si no se definió. El primer pago vence al siguiente periodo tras la entrega.
    const deliveryBase = credit.scheduledDeliveryDate ? new Date(credit.scheduledDeliveryDate) : deliveredAt
    const periodDays = this.getPeriodDays(credit.frequency)
    const startDate = new Date(deliveryBase.getTime() + periodDays * 86400000)

    const endDate = this.calculateEndDate(startDate, credit)

    credit.status = CreditStatus.ACTIVE
    credit.deliveredBy = DI.users.getReference(deliveredById)
    credit.deliveredAt = deliveredAt
    credit.firstPaymentToday = false
    credit.startDate = this.toDateStr(startDate)
    credit.endDate = this.toDateStr(endDate)
    if (notes) {
      credit.deliveryNotes = credit.deliveryNotes ? `${credit.deliveryNotes}\n\nEntrega: ${notes}` : `Entrega: ${notes}`
    }

    await DI.em.persistAndFlush(credit)
    return credit
  }

  async rescheduleDelivery(
    id: string,
    newDate: string,
    userId: string,
    reason?: string
  ): Promise<Credit | { error: 'CREDIT_NOT_FOUND' | 'INVALID_STATUS' }> {
    const credit = await DI.credits.findOne({ id })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    if (credit.status !== CreditStatus.WAITING_DELIVERY) {
      return { error: 'INVALID_STATUS' }
    }

    const oldDate = credit.scheduledDeliveryDate
    let notes = credit.deliveryNotes ?? ''
    notes += `\n\nReprogramado: ${oldDate ? oldDate.toISOString() : 'n/a'} -> ${newDate}`
    if (reason) {
      notes += `\nMotivo: ${reason}`
    }

    credit.scheduledDeliveryDate = new Date(newDate)
    credit.deliveryNotes = notes

    await DI.em.persistAndFlush(credit)
    return credit
  }

  // ------------------------------------------------------------------
  // Pagos
  // ------------------------------------------------------------------

  processPayment(
    credit: Credit,
    paymentAmount: number
  ): {
    payment_amount: number
    regular_installment: number
    remaining_balance: number
    type: 'regular' | 'full_payment' | 'multiple_installments' | 'partial'
    message: string
    installments_covered: number
    excess_amount: number
  } {
    const currentBalance = Number(credit.balance)
    const regularInstallment = Number(credit.installmentAmount ?? this.calculateInstallmentAmount(credit))

    const result: {
      payment_amount: number
      regular_installment: number
      remaining_balance: number
      type: 'regular' | 'full_payment' | 'multiple_installments' | 'partial'
      message: string
      installments_covered: number
      excess_amount: number
    } = {
      payment_amount: paymentAmount,
      regular_installment: regularInstallment,
      remaining_balance: Math.max(0, currentBalance - paymentAmount),
      type: 'regular',
      message: '',
      installments_covered: 0,
      excess_amount: 0,
    }

    if (paymentAmount > currentBalance) {
      result.type = 'full_payment'
      result.excess_amount = paymentAmount - currentBalance
      result.remaining_balance = 0
      result.message = `Pago completo del crédito. Exceso: ${result.excess_amount}.`
      result.installments_covered = Math.max(
        0,
        this.calculateTotalInstallments(credit) - Number(credit.paidInstallmentsCount ?? 0)
      )
    } else if (paymentAmount >= regularInstallment) {
      const installmentsCovered = Math.floor(paymentAmount / regularInstallment)
      result.installments_covered = installmentsCovered
      result.type = installmentsCovered > 1 ? 'multiple_installments' : 'regular'
      result.message = `Pago cubre ${installmentsCovered} cuota(s).`
    } else {
      result.type = 'partial'
      result.message = `Pago parcial. Falta: ${(regularInstallment - paymentAmount).toFixed(2)} para completar la cuota.`
    }

    return result
  }

  async recalculateCreditFromPayments(credit: Credit): Promise<void> {
    const completedPayments = await DI.payments.find({
      credit: credit.id,
      status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
    })

    const totalPaid = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    const schedule = await this.getPaymentSchedule(credit)
    const completedInstallments = schedule.filter((s) => s.is_paid).length

    const totalAmount = Number(credit.totalAmount ?? this.calculateTotalAmount(credit))
    const newBalance = Math.max(0, totalAmount - totalPaid)

    credit.totalPaid = totalPaid
    credit.paidInstallmentsCount = completedInstallments
    credit.balance = newBalance

    if (newBalance <= 0.001 && totalPaid >= totalAmount - 0.001) {
      credit.status = CreditStatus.PAID_OFF
      credit.completedAt = new Date()
    } else if (credit.status === CreditStatus.DEFAULTED) {
      // Si un crédito en mora se pone al día (pagó al menos todas las cuotas vencidas), vuelve a activo.
      // Se compara dinero pagado vs dinero vencido (robusto a pagos que cubren varias cuotas).
      const expected = await this.getExpectedInstallments(credit)
      const expectedAmount = expected * Number(credit.installmentAmount ?? 0)
      if (totalPaid >= expectedAmount - 0.001) {
        credit.status = CreditStatus.ACTIVE
        credit.completedAt = undefined
      }
    }

    await DI.em.persistAndFlush(credit)
  }

  // ------------------------------------------------------------------
  // Cobrar hoy
  // ------------------------------------------------------------------

  async getTodayCollections(): Promise<
    {
      creditId: string
      client: string
      identification: string
      dueDate: string
      amount: number
      paidAmount: number
      balance: number
      daysLate: number
      frequency: CreditFrequency
    }[]
  > {
    const active = await DI.credits.find(
      { status: { $in: [CreditStatus.ACTIVE, CreditStatus.DEFAULTED] } },
      { populate: ['client'] }
    )
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const items: Awaited<ReturnType<typeof this.getTodayCollections>> = []

    for (const credit of active) {
      const schedule = await this.getPaymentSchedule(credit)
      const next = schedule.find((s) => !s.is_paid)
      if (!next) continue

      const due = new Date(`${next.due_date}T00:00:00`)
      if (due.getTime() <= today.getTime()) {
        items.push({
          creditId: credit.id,
          client: credit.client.name,
          identification: credit.client.identification,
          dueDate: next.due_date,
          amount: next.amount,
          paidAmount: next.paid_amount,
          balance: Number(credit.balance),
          daysLate: Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000)),
          frequency: credit.frequency,
        })
      }
    }

    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    return items
  }

  async getClientStatement(clientId: string): Promise<{
    totalDebt: number
    totalFinanced: number
    totalPaid: number
    paidCreditsCount: number
    nextPayments: { creditId: string; dueDate: string; amount: number }[]
  } | null> {
    const active = await DI.credits.find(
      { client: clientId, status: { $nin: [CreditStatus.PAID_OFF, CreditStatus.CANCELLED, CreditStatus.DEFAULTED] } },
      { orderBy: { createdAt: 'DESC' } }
    )

    const allPayments = await DI.payments.find({
      client: clientId,
      status: { $in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIAL] },
    })

    const totalDebt = active.reduce((s, c) => s + Number(c.balance), 0)
    const totalFinanced = active.reduce((s, c) => s + Number(c.amount), 0)
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0)
    const paidCreditsCount = await DI.credits.count({ client: clientId, status: CreditStatus.PAID_OFF })

    const nextPayments: { creditId: string; dueDate: string; amount: number }[] = []
    for (const credit of active) {
      const schedule = await this.getPaymentSchedule(credit)
      const next = schedule.find((s) => !s.is_paid)
      if (next) {
        nextPayments.push({ creditId: credit.id, dueDate: next.due_date, amount: next.amount })
      }
    }
    nextPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

    return {
      totalDebt,
      totalFinanced,
      totalPaid,
      paidCreditsCount,
      nextPayments,
    }
  }

  // ------------------------------------------------------------------
  // Seguimiento de mora
  // ------------------------------------------------------------------

  async listFollowUps(creditId: string): Promise<CreditFollowUp[]> {
    return DI.creditFollowUps.find(
      { credit: creditId },
      { populate: ['createdBy'], orderBy: { createdAt: 'DESC' } }
    )
  }

  async addFollowUp(creditId: string, note: string, userId: string): Promise<CreditFollowUp | { error: 'CREDIT_NOT_FOUND' }> {
    const credit = await DI.credits.findOne({ id: creditId })
    if (!credit) {
      return { error: 'CREDIT_NOT_FOUND' }
    }
    const followUp = DI.creditFollowUps.create({
      credit,
      note,
      createdBy: DI.users.getReference(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await DI.em.persistAndFlush(followUp)
    return followUp
  }

  async removeFollowUp(followUpId: string): Promise<boolean | { error: 'FOLLOW_UP_NOT_FOUND' }> {
    const followUp = await DI.creditFollowUps.findOne({ id: followUpId })
    if (!followUp) {
      return { error: 'FOLLOW_UP_NOT_FOUND' }
    }
    await DI.em.removeAndFlush(followUp)
    return true
  }
}

export const creditService = new CreditService()
