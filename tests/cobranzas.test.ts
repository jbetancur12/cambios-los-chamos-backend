import { describe, before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { UserRole, type User } from '@/entities/User'
import { creditService } from '@/services/cobranzas/CreditService'
import { CreditFrequency } from '@/entities/Credit'
import { setupTestDb, resetTestDb, closeTestDb, inContext } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import { createAdmin, createUser } from './helpers/factories'

type Datos<T> = { data: T }
const datos = <T>(res: { body: unknown }) => (res.body as Datos<T>).data

interface CreditoVista {
  id: string
  status: string
  amount: number
  totalAmount: number
  installmentAmount: number
  totalInstallments: number
  paidInstallments: number
  totalPaid: number
  balance: number
  startDate: string
  endDate: string
  isOverdue: boolean
  overdueInstallments: number
  overdueAmount: number
  daysOverdue: number
  nextDueDate: string | null
}

interface ItemPorCobrar {
  creditId: string
  amountDue: number
  overdueInstallments: number
  daysLate: number
  lastFollowUp?: { note: string }
}

interface PorCobrar {
  summary: {
    overdueCount: number
    overdueAmount: number
    dueTodayCount: number
    dueTodayAmount: number
    collectedToday: number
    outstandingBalance: number
    activeCredits: number
  }
  items: ItemPorCobrar[]
}

// Fecha local YYYY-MM-DD, a `dias` días de hoy (negativo = pasado)
const fecha = (dias: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

describe('Cobranzas: cálculo de cuotas y fechas', () => {
  test('cuota entera y total ajustado a cuota × n', () => {
    assert.deepEqual(creditService.calculateTerms(100_000, 20, 10), { installmentAmount: 12_000, totalAmount: 120_000 })
    // 115.000 / 7 = 16.428,57 → cuota 16.429 y total 115.003 (sin fracciones ni residuos)
    assert.deepEqual(creditService.calculateTerms(100_000, 15, 7), { installmentAmount: 16_429, totalAmount: 115_003 })
    // sin interés
    assert.deepEqual(creditService.calculateTerms(50_000, 0, 5), { installmentAmount: 10_000, totalAmount: 50_000 })
  })

  test('la primera cuota es fecha del préstamo + un periodo y la última, n-1 periodos después', () => {
    const base = new Date('2026-10-03T00:00:00')
    assert.deepEqual(creditService.calculateDates(base, CreditFrequency.DAILY, 5), {
      startDate: '2026-10-04',
      endDate: '2026-10-08',
    })
    assert.deepEqual(creditService.calculateDates(base, CreditFrequency.WEEKLY, 10), {
      startDate: '2026-10-10',
      endDate: '2026-12-12',
    })
    assert.deepEqual(creditService.calculateDates(base, CreditFrequency.BIWEEKLY, 4), {
      startDate: '2026-10-18',
      endDate: '2026-12-02',
    })
    assert.deepEqual(creditService.calculateDates(base, CreditFrequency.MONTHLY, 3), {
      startDate: '2026-11-02',
      endDate: '2027-01-01',
    })
  })
})

describe('Cobranzas: préstamos, pagos y mora', () => {
  let app: TestApp
  let superAdmin: User

  before(async () => {
    await setupTestDb()
    app = await startTestApp()
  })
  beforeEach(async () => {
    await resetTestDb()
    superAdmin = await inContext(() => createUser(UserRole.SUPER_ADMIN))
  })
  after(async () => {
    await app.close()
    await closeTestDb()
  })

  const api = (method: string, path: string, body?: unknown, as: User = superAdmin) =>
    app.request(method, `/cobranzas${path}`, { as, body })

  const crearCliente = async (identification = '900111222') => {
    const res = await api('POST', '/clients', { name: 'Cliente Prueba', identification, phone: '3001234567' })
    assert.equal(res.status, 201)
    return datos<{ client: { id: string } }>(res).client.id
  }

  // Préstamo diario de 50.000 al 20 % en 5 cuotas de 12.000 (total 60.000), entregado hace `hace` días
  const crearPrestamo = async (
    clientId: string,
    opciones: {
      amount?: number
      interestRate?: number
      totalInstallments?: number
      frequency?: string
      hace?: number
    } = {}
  ) => {
    const res = await api('POST', '/credits', {
      clientId,
      amount: opciones.amount ?? 50_000,
      interestRate: opciones.interestRate ?? 20,
      totalInstallments: opciones.totalInstallments ?? 5,
      frequency: opciones.frequency ?? 'daily',
      loanDate: fecha(-(opciones.hace ?? 0)),
    })
    assert.equal(res.status, 201)
    return datos<{ credit: CreditoVista }>(res).credit
  }

  const pagar = (creditId: string, amount: number) =>
    api('POST', '/payments', { creditId, amount, paymentMethod: 'cash' })

  const detalle = async (id: string) =>
    datos<{ credit: CreditoVista; schedule: { status: string; paid_amount: number }[] }>(
      await api('GET', `/credits/${id}`)
    )

  const porCobrar = async () => datos<PorCobrar>(await api('GET', '/collections'))

  describe('crear préstamos', () => {
    test('queda activo de inmediato, con cuota, total y saldo calculados', async () => {
      const credit = await crearPrestamo(await crearCliente(), {
        amount: 100_000,
        totalInstallments: 10,
        frequency: 'weekly',
      })
      assert.equal(credit.status, 'active')
      assert.equal(credit.installmentAmount, 12_000)
      assert.equal(credit.totalAmount, 120_000)
      assert.equal(credit.balance, 120_000)
      assert.equal(credit.totalPaid, 0)
      assert.equal(credit.isOverdue, false)
    })

    test('solo el SUPER_ADMIN puede usar el módulo', async () => {
      const admin = await inContext(() => createAdmin())
      const res = await api('GET', '/collections', undefined, admin)
      assert.equal(res.status, 403)
    })

    test('rechaza un cliente inexistente y datos inválidos', async () => {
      const inexistente = await api('POST', '/credits', {
        clientId: '00000000-0000-4000-8000-000000000000',
        amount: 1000,
        interestRate: 10,
        totalInstallments: 2,
        frequency: 'daily',
      })
      assert.equal(inexistente.status, 404)

      const sinCuotas = await api('POST', '/credits', {
        clientId: await crearCliente(),
        amount: 1000,
        interestRate: 10,
        totalInstallments: 0,
        frequency: 'daily',
      })
      assert.equal(sinCuotas.status, 400)
    })
  })

  describe('pagos y cronograma', () => {
    test('un pago puede cubrir varias cuotas y el resto queda como abono parcial', async () => {
      const credit = await crearPrestamo(await crearCliente(), {
        amount: 100_000,
        totalInstallments: 10,
        frequency: 'weekly',
      })

      const res = await pagar(credit.id, 25_000)
      assert.equal(res.status, 201)
      const { credit: despues, coverage } = datos<{ credit: CreditoVista; coverage: { installmentsCovered: number } }>(
        res
      )
      assert.equal(coverage.installmentsCovered, 2)
      assert.equal(despues.paidInstallments, 2)
      assert.equal(despues.totalPaid, 25_000)
      assert.equal(despues.balance, 95_000)

      const { schedule } = await detalle(credit.id)
      assert.deepEqual(
        schedule.slice(0, 4).map((c) => [c.status, c.paid_amount]),
        [
          ['paid', 12_000],
          ['paid', 12_000],
          ['partial', 1_000],
          ['pending', 0],
        ]
      )
    })

    test('rechaza pagar más que el saldo', async () => {
      const credit = await crearPrestamo(await crearCliente())
      const res = await pagar(credit.id, 60_001 + 1_000)
      assert.equal(res.status, 400)
      assert.equal((await detalle(credit.id)).credit.totalPaid, 0)
    })

    test('al pagar el saldo completo el préstamo queda pagado y ya no admite pagos', async () => {
      const credit = await crearPrestamo(await crearCliente())
      const res = await pagar(credit.id, 60_000)
      assert.equal(res.status, 201)
      assert.equal(datos<{ credit: CreditoVista }>(res).credit.status, 'paid_off')

      assert.equal((await pagar(credit.id, 1_000)).status, 409)
    })

    test('anular un pago devuelve el saldo y reactiva un préstamo que estaba pagado', async () => {
      const credit = await crearPrestamo(await crearCliente())
      const pago = datos<{ payment: { id: string } }>(await pagar(credit.id, 60_000)).payment

      const res = await api('DELETE', `/payments/${pago.id}`)
      assert.equal(res.status, 200)

      const { credit: despues } = await detalle(credit.id)
      assert.equal(despues.status, 'active')
      assert.equal(despues.totalPaid, 0)
      assert.equal(despues.balance, 60_000)
    })
  })

  describe('mora (se calcula, no se guarda)', () => {
    test('un préstamo con todas las cuotas vencidas aparece en "Por cobrar" con lo que debe', async () => {
      // Diario de 5 cuotas, entregado hace 10 días: cuotas de hace 9 a hace 5 días
      const credit = await crearPrestamo(await crearCliente(), { hace: 10 })
      assert.equal(credit.isOverdue, true)
      assert.equal(credit.overdueInstallments, 5)
      assert.equal(credit.overdueAmount, 60_000)
      assert.equal(credit.daysOverdue, 9)

      const { summary, items } = await porCobrar()
      assert.equal(items.length, 1)
      assert.equal(items[0].creditId, credit.id)
      assert.equal(items[0].amountDue, 60_000)
      assert.equal(items[0].daysLate, 9)
      assert.equal(summary.overdueCount, 1)
      assert.equal(summary.overdueAmount, 60_000)
    })

    test('pagar parte de lo vencido reduce la mora y los días de atraso', async () => {
      const credit = await crearPrestamo(await crearCliente(), { hace: 10 })
      await pagar(credit.id, 24_000) // 2 cuotas

      const { credit: despues } = await detalle(credit.id)
      assert.equal(despues.overdueInstallments, 3)
      assert.equal(despues.overdueAmount, 36_000)
      assert.equal(despues.daysOverdue, 7) // la más antigua sin pagar es la 3.ª: hace 7 días
    })

    test('al pagar todo lo vencido sale de "Por cobrar"', async () => {
      const credit = await crearPrestamo(await crearCliente(), { hace: 10 })
      await pagar(credit.id, 60_000)

      const { summary, items } = await porCobrar()
      assert.equal(items.length, 0)
      assert.equal(summary.overdueCount, 0)
      assert.equal(summary.collectedToday, 60_000)
    })

    test('una cuota que vence hoy cuenta como "vence hoy", no como mora', async () => {
      const credit = await crearPrestamo(await crearCliente(), { hace: 1 })
      assert.equal(credit.isOverdue, false)
      assert.equal(credit.nextDueDate, fecha(0))

      const { summary, items } = await porCobrar()
      assert.equal(items.length, 1)
      assert.equal(items[0].daysLate, 0)
      assert.equal(items[0].amountDue, 12_000)
      assert.equal(summary.dueTodayCount, 1)
      assert.equal(summary.dueTodayAmount, 12_000)
      assert.equal(summary.overdueCount, 0)
    })

    test('un préstamo recién creado no aparece: su primera cuota es mañana', async () => {
      await crearPrestamo(await crearCliente())
      const { summary, items } = await porCobrar()
      assert.equal(items.length, 0)
      assert.equal(summary.activeCredits, 1)
      assert.equal(summary.outstandingBalance, 60_000)
    })

    test('ordena primero al que lleva más días de atraso', async () => {
      const clienteA = await crearCliente('A-1')
      const clienteB = await crearCliente('B-2')
      const reciente = await crearPrestamo(clienteA, { hace: 3 })
      const antiguo = await crearPrestamo(clienteB, { hace: 10 })

      const { items } = await porCobrar()
      assert.deepEqual(
        items.map((i) => i.creditId),
        [antiguo.id, reciente.id]
      )
    })

    test('el filtro "en mora" del listado solo trae los atrasados', async () => {
      const cliente = await crearCliente()
      await crearPrestamo(cliente) // al día
      const atrasado = await crearPrestamo(cliente, { hace: 10 })

      const res = await api('GET', '/credits?overdueOnly=true')
      const { items } = datos<{ items: CreditoVista[] }>(res)
      assert.deepEqual(
        items.map((c) => c.id),
        [atrasado.id]
      )
    })

    test('las notas de seguimiento aparecen en la fila de "Por cobrar"', async () => {
      const credit = await crearPrestamo(await crearCliente(), { hace: 10 })
      const res = await api('POST', `/credits/${credit.id}/follow-ups`, { note: 'Prometió pagar el viernes' })
      assert.equal(res.status, 201)

      const { items } = await porCobrar()
      assert.equal(items[0].lastFollowUp?.note, 'Prometió pagar el viernes')
    })
  })

  describe('editar y anular préstamos', () => {
    test('sin pagos se puede editar y se recalcula todo', async () => {
      const credit = await crearPrestamo(await crearCliente())
      const res = await api('PATCH', `/credits/${credit.id}`, { amount: 100_000, totalInstallments: 10 })
      assert.equal(res.status, 200)

      const editado = datos<{ credit: CreditoVista }>(res).credit
      assert.equal(editado.totalAmount, 120_000)
      assert.equal(editado.installmentAmount, 12_000)
      assert.equal(editado.balance, 120_000)
      assert.equal(editado.totalInstallments, 10)
    })

    test('con pagos no se puede editar ni anular', async () => {
      const credit = await crearPrestamo(await crearCliente())
      await pagar(credit.id, 12_000)

      assert.equal((await api('PATCH', `/credits/${credit.id}`, { amount: 99_000 })).status, 409)
      assert.equal((await api('POST', `/credits/${credit.id}/cancel`)).status, 409)
    })

    test('un préstamo anulado deja de aparecer como activo y no admite pagos', async () => {
      const credit = await crearPrestamo(await crearCliente(), { hace: 10 })
      const res = await api('POST', `/credits/${credit.id}/cancel`)
      assert.equal(res.status, 200)
      assert.equal(datos<{ credit: CreditoVista }>(res).credit.status, 'cancelled')

      assert.equal((await porCobrar()).items.length, 0)
      assert.equal((await pagar(credit.id, 1_000)).status, 409)
    })
  })

  describe('clientes', () => {
    test('no permite dos clientes con la misma cédula', async () => {
      await crearCliente('123')
      const res = await api('POST', '/clients', { name: 'Otro', identification: '123' })
      assert.equal(res.status, 409)
    })

    test('no se puede eliminar un cliente con préstamos, pero sí uno sin ellos', async () => {
      const conPrestamo = await crearCliente('111')
      await crearPrestamo(conPrestamo)
      assert.equal((await api('DELETE', `/clients/${conPrestamo}`)).status, 409)

      const libre = await crearCliente('222')
      assert.equal((await api('DELETE', `/clients/${libre}`)).status, 200)
    })

    test('la ficha del cliente resume su deuda y su mora', async () => {
      const cliente = await crearCliente()
      await crearPrestamo(cliente, { hace: 10 })
      await crearPrestamo(cliente) // al día: 60.000 de saldo, sin mora

      const ficha = datos<{ summary: { totalDebt: number; overdueAmount: number } }>(
        await api('GET', `/clients/${cliente}`)
      )
      assert.equal(ficha.summary.totalDebt, 120_000)
      assert.equal(ficha.summary.overdueAmount, 60_000)

      const lista = datos<{ items: { id: string; activeCredits: number; totalDebt: number }[] }>(
        await api('GET', '/clients')
      )
      assert.equal(lista.items[0].activeCredits, 2)
      assert.equal(lista.items[0].totalDebt, 120_000)
    })
  })
})
