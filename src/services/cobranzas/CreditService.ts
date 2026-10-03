import { DI } from '@/di'
import { Credit, CreditFrequency, CreditStatus } from '@/entities/Credit'
import { CreditFollowUp } from '@/entities/CreditFollowUp'
import { Payment, PaymentStatus } from '@/entities/Payment'

export interface CreateCreditInput {
  clientId: string
  amount: number
  interestRate: number
  totalInstallments: number
  frequency: CreditFrequency
  loanDate?: string
  description?: string
}

export interface ScheduleItem {
  installment_number: number
  due_date: string
  amount: number
  paid_amount: number
  remaining_amount: number
  status: 'paid' | 'partial' | 'overdue' | 'pending'
}

export interface CreditView {
  id: string
  client: Credit['client']
  amount: number
  interestRate: number
  totalAmount: number
  installmentAmount: number
  totalInstallments: number
  paidInstallments: number
  totalPaid: number
  balance: number
  frequency: CreditFrequency
  startDate: string
  endDate: string
  status: CreditStatus
  description?: string
  createdAt: Date
  completedAt?: Date
  isOverdue: boolean
  overdueInstallments: number
  overdueAmount: number
  daysOverdue: number
  nextDueDate: string | null
}

const DAY_MS = 86400000
export const PERIOD_DAYS: Record<CreditFrequency, number> = {
  [CreditFrequency.DAILY]: 1,
  [CreditFrequency.WEEKLY]: 7,
  [CreditFrequency.BIWEEKLY]: 15,
  [CreditFrequency.MONTHLY]: 30,
}

const toDateStr = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const parseDate = (value: string): Date => new Date(`${value}T00:00:00`)

const startOfToday = (): Date => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

type CreditError = {
  error: 'CLIENT_NOT_FOUND' | 'CLIENT_INACTIVE' | 'CREDIT_NOT_FOUND' | 'HAS_PAYMENTS' | 'NOT_ACTIVE'
}

export class CreditService {
  // ------------------------------------------------------------------
  // Cálculos (puros, a partir de lo que ya está guardado en el crédito)
  // ------------------------------------------------------------------

  /** Cuota entera y total ajustado a cuota × n (evita fracciones y residuos). */
  calculateTerms(amount: number, interestRate: number, installments: number) {
    const totalRaw = amount + amount * (interestRate / 100)
    const installmentAmount = Math.round(totalRaw / installments)
    return { installmentAmount, totalAmount: installmentAmount * installments }
  }

  /** Primera cuota = fecha del préstamo + un periodo; última = primera + (n-1) periodos. */
  calculateDates(loanDate: Date, frequency: CreditFrequency, installments: number) {
    const period = PERIOD_DAYS[frequency]
    const start = addDays(loanDate, period)
    const end = addDays(start, (installments - 1) * period)
    return { startDate: toDateStr(start), endDate: toDateStr(end) }
  }

  /**
   * Cronograma por pago acumulado: un pago puede cubrir varias cuotas.
   * La cuota i está pagada si el total pagado alcanza i × monto de cuota.
   */
  getSchedule(credit: Credit): ScheduleItem[] {
    const installmentAmount = Number(credit.installmentAmount ?? 0)
    const totalInstallments = Number(credit.totalInstallments ?? 0)
    const totalPaid = Number(credit.totalPaid ?? 0)
    const start = parseDate(credit.startDate)
    const period = PERIOD_DAYS[credit.frequency]
    const today = startOfToday()

    const schedule: ScheduleItem[] = []
    for (let i = 0; i < totalInstallments; i++) {
      const due = addDays(start, i * period)
      let paid = Math.min(installmentAmount, Math.max(0, totalPaid - i * installmentAmount))
      // Residuo de redondeo (< 1 unidad): no es un pago real sobre esta cuota
      if (paid < 1) paid = 0
      const isPaid = paid >= installmentAmount - 0.001

      let status: ScheduleItem['status'] = 'pending'
      if (isPaid) status = 'paid'
      else if (paid > 0) status = 'partial'
      else if (due.getTime() < today.getTime()) status = 'overdue'

      schedule.push({
        installment_number: i + 1,
        due_date: toDateStr(due),
        amount: installmentAmount,
        paid_amount: paid,
        remaining_amount: Math.max(0, installmentAmount - paid),
        status,
      })
    }
    return schedule
  }

  /** Vista del crédito con los derivados de mora calculados al vuelo. */
  toView(credit: Credit): CreditView {
    const schedule = this.getSchedule(credit)
    const today = startOfToday()
    const unpaid = schedule.filter((s) => s.status !== 'paid')
    const overdue = unpaid.filter((s) => parseDate(s.due_date).getTime() < today.getTime())
    const isActive = credit.status === CreditStatus.ACTIVE
    const overdueItems = isActive ? overdue : []

    const oldest = overdueItems[0]
    const daysOverdue = oldest ? Math.floor((today.getTime() - parseDate(oldest.due_date).getTime()) / DAY_MS) : 0

    return {
      id: credit.id,
      client: credit.client,
      amount: Number(credit.amount),
      interestRate: Number(credit.interestRate),
      totalAmount: Number(credit.totalAmount ?? 0),
      installmentAmount: Number(credit.installmentAmount ?? 0),
      totalInstallments: Number(credit.totalInstallments ?? 0),
      paidInstallments: schedule.filter((s) => s.status === 'paid').length,
      totalPaid: Number(credit.totalPaid),
      balance: Number(credit.balance),
      frequency: credit.frequency,
      startDate: credit.startDate,
      endDate: credit.endDate ?? credit.startDate,
      status: credit.status,
      description: credit.description,
      createdAt: credit.createdAt,
      completedAt: credit.completedAt,
      isOverdue: overdueItems.length > 0,
      overdueInstallments: overdueItems.length,
      overdueAmount: overdueItems.reduce((sum, s) => sum + s.remaining_amount, 0),
      daysOverdue,
      nextDueDate: isActive && unpaid[0] ? unpaid[0].due_date : null,
    }
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async createCredit(input: CreateCreditInput, userId: string): Promise<CreditView | CreditError> {
    const client = await DI.cobranzaClients.findOne({ id: input.clientId })
    if (!client) return { error: 'CLIENT_NOT_FOUND' }
    if (!client.isActive) return { error: 'CLIENT_INACTIVE' }

    const loanDate = input.loanDate ? parseDate(input.loanDate) : startOfToday()
    const { installmentAmount, totalAmount } = this.calculateTerms(
      input.amount,
      input.interestRate,
      input.totalInstallments
    )
    const { startDate, endDate } = this.calculateDates(loanDate, input.frequency, input.totalInstallments)

    const credit = DI.credits.create({
      client,
      createdBy: DI.users.getReference(userId),
      amount: input.amount,
      balance: totalAmount,
      frequency: input.frequency,
      startDate,
      endDate,
      status: CreditStatus.ACTIVE,
      interestRate: input.interestRate,
      totalAmount,
      installmentAmount,
      totalInstallments: input.totalInstallments,
      paidInstallmentsCount: 0,
      totalPaid: 0,
      description: input.description,
      createdAt: loanDate,
      updatedAt: new Date(),
    })

    await DI.em.persistAndFlush(credit)
    return this.toView(credit)
  }

  /** Solo se puede editar mientras no tenga pagos: se recalcula todo. */
  async updateCredit(id: string, data: Partial<CreateCreditInput>): Promise<CreditView | CreditError> {
    const credit = await DI.credits.findOne({ id }, { populate: ['client'] })
    if (!credit) return { error: 'CREDIT_NOT_FOUND' }
    if (credit.status !== CreditStatus.ACTIVE) return { error: 'NOT_ACTIVE' }
    if (await this.hasPayments(id)) return { error: 'HAS_PAYMENTS' }

    if (data.clientId && data.clientId !== credit.client.id) {
      const client = await DI.cobranzaClients.findOne({ id: data.clientId })
      if (!client) return { error: 'CLIENT_NOT_FOUND' }
      credit.client = client
    }

    const amount = data.amount ?? Number(credit.amount)
    const interestRate = data.interestRate ?? Number(credit.interestRate)
    const installments = data.totalInstallments ?? Number(credit.totalInstallments)
    const frequency = data.frequency ?? credit.frequency
    const loanDate = data.loanDate
      ? parseDate(data.loanDate)
      : addDays(parseDate(credit.startDate), -PERIOD_DAYS[credit.frequency])

    const { installmentAmount, totalAmount } = this.calculateTerms(amount, interestRate, installments)
    const { startDate, endDate } = this.calculateDates(loanDate, frequency, installments)

    credit.amount = amount
    credit.interestRate = interestRate
    credit.totalInstallments = installments
    credit.frequency = frequency
    credit.installmentAmount = installmentAmount
    credit.totalAmount = totalAmount
    credit.balance = totalAmount
    credit.startDate = startDate
    credit.endDate = endDate
    credit.createdAt = loanDate
    if (data.description !== undefined) credit.description = data.description

    await DI.em.persistAndFlush(credit)
    return this.toView(credit)
  }

  async cancelCredit(id: string): Promise<CreditView | CreditError> {
    const credit = await DI.credits.findOne({ id }, { populate: ['client'] })
    if (!credit) return { error: 'CREDIT_NOT_FOUND' }
    if (credit.status !== CreditStatus.ACTIVE) return { error: 'NOT_ACTIVE' }
    if (await this.hasPayments(id)) return { error: 'HAS_PAYMENTS' }

    credit.status = CreditStatus.CANCELLED
    await DI.em.persistAndFlush(credit)
    return this.toView(credit)
  }

  private async hasPayments(creditId: string): Promise<boolean> {
    const count = await DI.payments.count({ credit: creditId, status: PaymentStatus.COMPLETED })
    return count > 0
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listCredits(params: {
    status?: CreditStatus
    clientId?: string
    search?: string
    overdueOnly?: boolean
    page?: number
    limit?: number
  }): Promise<{ items: CreditView[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (params.status) where.status = params.status
    if (params.clientId) where.client = params.clientId
    if (params.search) {
      const clients = await DI.cobranzaClients.find({
        $or: [{ name: { $ilike: `%${params.search}%` } }, { identification: { $ilike: `%${params.search}%` } }],
      })
      where.client = { $in: clients.map((c) => c.id) }
    }

    // La mora se calcula, no se guarda: se filtra en memoria sobre los activos.
    if (params.overdueOnly) {
      const active = await DI.credits.find(
        { ...where, status: CreditStatus.ACTIVE },
        { populate: ['client'], orderBy: { createdAt: 'DESC' } }
      )
      const overdue = active.map((c) => this.toView(c)).filter((v) => v.isOverdue)
      overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)
      return { items: overdue, total: overdue.length }
    }

    const limit = params.limit ?? 50
    const offset = ((params.page ?? 1) - 1) * limit
    const [items, total] = await DI.credits.findAndCount(where, {
      populate: ['client'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset,
    })
    return { items: items.map((c) => this.toView(c)), total }
  }

  async getCreditDetail(id: string): Promise<
    | {
        credit: CreditView
        schedule: ScheduleItem[]
        payments: Payment[]
        followUps: CreditFollowUp[]
      }
    | CreditError
  > {
    const credit = await DI.credits.findOne({ id }, { populate: ['client'] })
    if (!credit) return { error: 'CREDIT_NOT_FOUND' }

    const payments = await DI.payments.find(
      { credit: id, status: PaymentStatus.COMPLETED },
      { orderBy: { paymentDate: 'DESC' } }
    )
    const followUps = await this.listFollowUps(id)
    return { credit: this.toView(credit), schedule: this.getSchedule(credit), payments, followUps }
  }

  /** Por cobrar: préstamos activos con cuotas vencidas o que vencen hoy. */
  async getCollections() {
    const today = startOfToday()
    const todayStr = toDateStr(today)

    const active = await DI.credits.find({ status: CreditStatus.ACTIVE }, { populate: ['client'] })
    const lastFollowUps = await this.getLastFollowUps(active.map((c) => c.id))

    const items: {
      creditId: string
      client: { id: string; name: string; identification: string; phone?: string; address?: string }
      frequency: CreditFrequency
      installmentAmount: number
      amountDue: number
      overdueInstallments: number
      daysLate: number
      dueDate: string
      balance: number
      paidInstallments: number
      totalInstallments: number
      lastFollowUp?: { note: string; createdAt: Date }
    }[] = []

    let overdueAmount = 0
    let overdueCount = 0
    let dueTodayAmount = 0
    let dueTodayCount = 0
    let outstandingBalance = 0

    for (const credit of active) {
      outstandingBalance += Number(credit.balance)
      const schedule = this.getSchedule(credit)
      const dueNow = schedule.filter((s) => s.status !== 'paid' && s.due_date <= todayStr)
      if (dueNow.length === 0) continue

      const amountDue = dueNow.reduce((sum, s) => sum + s.remaining_amount, 0)
      const overdueItems = dueNow.filter((s) => s.due_date < todayStr)
      const oldest = dueNow[0]
      const daysLate = Math.floor((today.getTime() - parseDate(oldest.due_date).getTime()) / DAY_MS)

      if (overdueItems.length > 0) {
        overdueCount++
        overdueAmount += overdueItems.reduce((sum, s) => sum + s.remaining_amount, 0)
      } else {
        dueTodayCount++
      }
      dueTodayAmount += dueNow.filter((s) => s.due_date === todayStr).reduce((sum, s) => sum + s.remaining_amount, 0)

      items.push({
        creditId: credit.id,
        client: {
          id: credit.client.id,
          name: credit.client.name,
          identification: credit.client.identification,
          phone: credit.client.phone,
          address: credit.client.address,
        },
        frequency: credit.frequency,
        installmentAmount: Number(credit.installmentAmount ?? 0),
        amountDue,
        overdueInstallments: overdueItems.length,
        daysLate,
        dueDate: oldest.due_date,
        balance: Number(credit.balance),
        paidInstallments: schedule.filter((s) => s.status === 'paid').length,
        totalInstallments: Number(credit.totalInstallments ?? 0),
        lastFollowUp: lastFollowUps.get(credit.id),
      })
    }

    // Más días de atraso primero; a igualdad, mayor monto
    items.sort((a, b) => b.daysLate - a.daysLate || b.amountDue - a.amountDue)

    const collectedToday = await this.getCollectedToday()

    return {
      summary: {
        overdueCount,
        overdueAmount,
        dueTodayCount,
        dueTodayAmount,
        collectedToday,
        outstandingBalance,
        activeCredits: active.length,
      },
      items,
    }
  }

  private async getCollectedToday(): Promise<number> {
    const start = startOfToday()
    const end = addDays(start, 1)
    const payments = await DI.payments.find({
      status: PaymentStatus.COMPLETED,
      paymentDate: { $gte: start, $lt: end },
    })
    return payments.reduce((sum, p) => sum + Number(p.amount), 0)
  }

  private async getLastFollowUps(creditIds: string[]): Promise<Map<string, { note: string; createdAt: Date }>> {
    const result = new Map<string, { note: string; createdAt: Date }>()
    if (creditIds.length === 0) return result
    const followUps = await DI.creditFollowUps.find({ credit: { $in: creditIds } }, { orderBy: { createdAt: 'DESC' } })
    for (const f of followUps) {
      const creditId = f.credit.id
      if (!result.has(creditId)) result.set(creditId, { note: f.note, createdAt: f.createdAt })
    }
    return result
  }

  // ------------------------------------------------------------------
  // Recalcular tras pagos
  // ------------------------------------------------------------------

  async recalculateFromPayments(credit: Credit): Promise<void> {
    const payments = await DI.payments.find({ credit: credit.id, status: PaymentStatus.COMPLETED })
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
    const totalAmount = Number(credit.totalAmount ?? 0)
    const balance = Math.max(0, totalAmount - totalPaid)

    credit.totalPaid = totalPaid
    credit.balance = balance
    credit.paidInstallmentsCount = this.getSchedule(credit).filter((s) => s.status === 'paid').length

    if (credit.status !== CreditStatus.CANCELLED) {
      if (balance <= 0.001) {
        credit.status = CreditStatus.PAID_OFF
        credit.completedAt = credit.completedAt ?? new Date()
      } else {
        // Si se anuló un pago de un préstamo saldado, vuelve a activo
        credit.status = CreditStatus.ACTIVE
        credit.completedAt = undefined
      }
    }
    await DI.em.persistAndFlush(credit)
  }

  // ------------------------------------------------------------------
  // Seguimiento (notas)
  // ------------------------------------------------------------------

  async listFollowUps(creditId: string): Promise<CreditFollowUp[]> {
    return DI.creditFollowUps.find({ credit: creditId }, { populate: ['createdBy'], orderBy: { createdAt: 'DESC' } })
  }

  async addFollowUp(
    creditId: string,
    note: string,
    userId: string
  ): Promise<CreditFollowUp | { error: 'CREDIT_NOT_FOUND' }> {
    const credit = await DI.credits.findOne({ id: creditId })
    if (!credit) return { error: 'CREDIT_NOT_FOUND' }

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

  async removeFollowUp(followUpId: string): Promise<true | { error: 'FOLLOW_UP_NOT_FOUND' }> {
    const followUp = await DI.creditFollowUps.findOne({ id: followUpId })
    if (!followUp) return { error: 'FOLLOW_UP_NOT_FOUND' }
    await DI.em.removeAndFlush(followUp)
    return true
  }
}

export const creditService = new CreditService()
