import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { User, UserRole } from '@/entities/User'
import { CobranzaClient } from '@/entities/CobranzaClient'
import { Credit, CreditFrequency, CreditStatus } from '@/entities/Credit'
import { CreditFollowUp } from '@/entities/CreditFollowUp'
import { Payment, PaymentMethod, PaymentStatus } from '@/entities/Payment'
import { creditService, PERIOD_DAYS } from '@/services/cobranzas/CreditService'

/**
 * Datos de ejemplo del módulo de cobranzas: ~2 meses de historia relativa a HOY.
 *
 *   npm run seed:cobranzas
 *
 * No forma parte de `DatabaseSeeder` (no debe sembrarse en producción). Se puede correr varias veces:
 * borra lo que sembró antes (clientes marcados con SEED_NOTE y todo lo suyo) y lo recrea con fechas
 * nuevas. Necesita un usuario SUPER_ADMIN.
 */
export const SEED_NOTE = 'Cliente de ejemplo (seed)'

const METHODS = [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.MOBILE_PAYMENT]

const CLIENTS = [
  { name: 'Jorge Betancur', identification: '1010203040', phone: '3001112233', address: 'Cra 10 #20-30, Pereira' },
  {
    name: 'María Martínez',
    identification: '1088279491',
    phone: '3138124282',
    address: 'Calle 15 #8-42, Dosquebradas',
  },
  { name: 'Carlos Rojas', identification: '79456123', phone: '3204445566', address: 'Av. Circunvalar #5-18, Pereira' },
  { name: 'Luisa Fernández', identification: '42987654', phone: '3157778899', address: 'Mz 4 Casa 12, Cuba' },
  { name: 'Pedro Gómez', identification: '10123987', phone: '3112223344', address: 'Cra 7 #30-11, Pereira' },
  { name: 'Ana Torres', identification: '1004556677', phone: '3226669900', address: 'Calle 22 #12-05, Pereira' },
]

// Un pago planeado: sobre la cuota `i` (0 = primera), `delay` días después de su vencimiento
interface PlannedPayment {
  i: number
  delay?: number
  amount: number | 'cuota' | 'resto'
}

interface LoanSpec {
  client: number
  amount: number
  interestRate: number
  installments: number
  frequency: CreditFrequency
  /** Hace cuántos días se entregó el préstamo */
  ago: number
  payments?: PlannedPayment[]
  cancelled?: boolean
  followUps?: { ago: number; note: string }[]
}

// Cuotas `from..to-1` pagadas el día de su vencimiento
const onTime = (from: number, to: number): PlannedPayment[] =>
  Array.from({ length: to - from }, (_, k) => ({ i: from + k, amount: 'cuota' as const }))

const LOANS: LoanSpec[] = [
  // Pagado por completo, siempre al día (el más antiguo: 62 días)
  {
    client: 0,
    amount: 300_000,
    interestRate: 20,
    installments: 20,
    frequency: CreditFrequency.DAILY,
    ago: 62,
    payments: onTime(0, 20),
  },
  // Activo y al día: 5 de 8 semanales pagadas
  {
    client: 0,
    amount: 500_000,
    interestRate: 20,
    installments: 8,
    frequency: CreditFrequency.WEEKLY,
    ago: 40,
    payments: onTime(0, 5),
  },
  // En mora: pagó 3 cuotas, abonó la mitad de la 4.ª y dejó de pagar
  {
    client: 1,
    amount: 200_000,
    interestRate: 15,
    installments: 6,
    frequency: CreditFrequency.WEEKLY,
    ago: 50,
    payments: [...onTime(0, 3), { i: 3, delay: 2, amount: 19_000 }],
    followUps: [
      { ago: 18, note: 'Llamada: dice que está sin trabajo esta semana, promete abonar el viernes.' },
      { ago: 9, note: 'No contestó. Se dejó mensaje por WhatsApp.' },
    ],
  },
  // En mora fuerte: pagó 12 de 30 diarias y desapareció
  {
    client: 2,
    amount: 150_000,
    interestRate: 20,
    installments: 30,
    frequency: CreditFrequency.DAILY,
    ago: 35,
    payments: onTime(0, 12),
    followUps: [
      { ago: 20, note: 'Visita al negocio: cerrado. Vecino dice que viajó.' },
      { ago: 14, note: 'Llamada: contestó, dice que paga la próxima semana.' },
      { ago: 7, note: 'No cumplió. Apagado el teléfono.' },
      { ago: 2, note: 'Se habló con el fiador, queda en contactarlo.' },
    ],
  },
  // Mensual: 2 de 3 pagadas, la 2.ª un día tarde
  {
    client: 3,
    amount: 600_000,
    interestRate: 10,
    installments: 3,
    frequency: CreditFrequency.MONTHLY,
    ago: 62,
    payments: [
      { i: 0, amount: 'cuota' },
      { i: 1, delay: 1, amount: 'cuota' },
    ],
  },
  // Quincenal pagado por completo: abonó 3 cuotas y saldó el resto antes de tiempo
  {
    client: 4,
    amount: 250_000,
    interestRate: 20,
    installments: 4,
    frequency: CreditFrequency.BIWEEKLY,
    ago: 58,
    payments: [...onTime(0, 3), { i: 2, delay: 3, amount: 'resto' }],
  },
  // Mora leve: pagó 3 cuotas semanales (la 3.ª tarde) y la 4.ª venció hace 2 días
  {
    client: 5,
    amount: 100_000,
    interestRate: 20,
    installments: 10,
    frequency: CreditFrequency.WEEKLY,
    ago: 30,
    payments: [...onTime(0, 2), { i: 2, delay: 2, amount: 'cuota' }],
    followUps: [{ ago: 1, note: 'Recordatorio enviado por WhatsApp; respondió que paga mañana.' }],
  },
  // Anulado antes de entregar dinero
  {
    client: 5,
    amount: 80_000,
    interestRate: 20,
    installments: 4,
    frequency: CreditFrequency.WEEKLY,
    ago: 20,
    cancelled: true,
  },
  // Recién entregado ayer: su primera cuota vence hoy
  {
    client: 3,
    amount: 50_000,
    interestRate: 20,
    installments: 10,
    frequency: CreditFrequency.DAILY,
    ago: 1,
  },
]

// Fecha local (medianoche) a `days` días de hoy, más una hora del día para que no sean todas a las 00:00
const dayAt = (base: Date, days: number, hour: number): Date => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, (hour * 7) % 60, 0, 0)
  return d
}

export class CobranzasSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const superAdmin =
      (await em.findOne(User, { role: UserRole.SUPER_ADMIN, isActive: true })) ??
      (await em.findOne(User, { role: UserRole.SUPER_ADMIN }))
    if (!superAdmin) {
      throw new Error('CobranzasSeeder: no hay un usuario SUPER_ADMIN (corre `npm run create:superadmin` primero)')
    }

    await this.removePreviousSeed(em)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const now = new Date()

    const clients = CLIENTS.map((c) =>
      em.create(CobranzaClient, { ...c, notes: SEED_NOTE, isActive: true, createdAt: now, updatedAt: now })
    )
    em.persist(clients)

    let methodIndex = 0
    for (const spec of LOANS) {
      const loanDate = dayAt(today, -spec.ago, 9)
      const { installmentAmount, totalAmount } = creditService.calculateTerms(
        spec.amount,
        spec.interestRate,
        spec.installments
      )
      const { startDate, endDate } = creditService.calculateDates(loanDate, spec.frequency, spec.installments)

      const credit = em.create(Credit, {
        client: clients[spec.client],
        createdBy: superAdmin,
        amount: spec.amount,
        balance: totalAmount,
        frequency: spec.frequency,
        startDate,
        endDate,
        status: spec.cancelled ? CreditStatus.CANCELLED : CreditStatus.ACTIVE,
        interestRate: spec.interestRate,
        totalAmount,
        installmentAmount,
        totalInstallments: spec.installments,
        paidInstallmentsCount: 0,
        totalPaid: 0,
        createdAt: loanDate,
        updatedAt: loanDate,
      })
      em.persist(credit)

      // Pagos planeados → filas de Payment con fecha realista
      let totalPaid = 0
      let lastPaymentAt: Date | undefined
      for (const plan of spec.payments ?? []) {
        const due = new Date(`${startDate}T00:00:00`)
        due.setDate(due.getDate() + plan.i * PERIOD_DAYS[spec.frequency])
        const paidAt = dayAt(due, plan.delay ?? 0, 10 + (methodIndex % 7))
        if (paidAt.getTime() > now.getTime()) continue // nunca pagos en el futuro

        const amount =
          plan.amount === 'cuota' ? installmentAmount : plan.amount === 'resto' ? totalAmount - totalPaid : plan.amount

        em.persist(
          em.create(Payment, {
            credit,
            client: clients[spec.client],
            amount,
            paymentDate: paidAt,
            paymentMethod: METHODS[methodIndex++ % METHODS.length],
            status: PaymentStatus.COMPLETED,
            receivedBy: superAdmin,
            createdAt: paidAt,
            updatedAt: paidAt,
          })
        )
        totalPaid += amount
        lastPaymentAt = paidAt
      }

      // Estado del préstamo a partir de lo pagado (mismas reglas que CreditService.recalculateFromPayments)
      credit.totalPaid = totalPaid
      credit.balance = Math.max(0, totalAmount - totalPaid)
      credit.paidInstallmentsCount = creditService.getSchedule(credit).filter((s) => s.status === 'paid').length
      if (!spec.cancelled && credit.balance <= 0.001) {
        credit.status = CreditStatus.PAID_OFF
        credit.completedAt = lastPaymentAt
      }

      for (const f of spec.followUps ?? []) {
        const at = dayAt(today, -f.ago, 11)
        em.persist(
          em.create(CreditFollowUp, { credit, note: f.note, createdBy: superAdmin, createdAt: at, updatedAt: at })
        )
      }
    }

    await em.flush()
  }

  /** Borra lo sembrado antes (clientes con SEED_NOTE y sus pagos, notas y préstamos). */
  private async removePreviousSeed(em: EntityManager): Promise<void> {
    const previous = await em.find(CobranzaClient, { notes: SEED_NOTE })
    if (previous.length === 0) return
    const ids = previous.map((c) => c.id)
    const credits = await em.find(Credit, { client: { $in: ids } })
    const creditIds = credits.map((c) => c.id)

    await em.nativeDelete(Payment, { client: { $in: ids } })
    if (creditIds.length > 0) await em.nativeDelete(CreditFollowUp, { credit: { $in: creditIds } })
    await em.nativeDelete(Credit, { client: { $in: ids } })
    await em.nativeDelete(CobranzaClient, { id: { $in: ids } })
    em.clear()
  }
}
