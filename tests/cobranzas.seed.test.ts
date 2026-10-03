import { describe, before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { UserRole, type User } from '@/entities/User'
import { CreditStatus } from '@/entities/Credit'
import { CobranzasSeeder } from '@/seeders/CobranzasSeeder'
import { setupTestDb, resetTestDb, closeTestDb, inContext } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import { createUser } from './helpers/factories'

type Datos<T> = { data: T }
const datos = <T>(res: { body: unknown }) => (res.body as Datos<T>).data

describe('Cobranzas: seed de datos de ejemplo', () => {
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

  const sembrar = () => inContext(() => new CobranzasSeeder().run(DI.orm.em.fork()))
  const api = (path: string) => app.request('GET', `/cobranzas${path}`, { as: superAdmin })

  test('crea 6 clientes y 9 préstamos con historia de ~2 meses', async () => {
    await sembrar()

    const clientes = datos<{ total: number }>(await api('/clients'))
    assert.equal(clientes.total, 6)

    const todos = datos<{ items: { status: string; createdAt: string }[]; total: number }>(
      await api('/credits?limit=100')
    )
    assert.equal(todos.total, 9)

    const porEstado = (estado: string) => todos.items.filter((c) => c.status === estado).length
    assert.equal(porEstado(CreditStatus.PAID_OFF), 2)
    assert.equal(porEstado(CreditStatus.CANCELLED), 1)
    assert.equal(porEstado(CreditStatus.ACTIVE), 6)

    const masAntiguo = Math.min(...todos.items.map((c) => new Date(c.createdAt).getTime()))
    const dias = (Date.now() - masAntiguo) / 86_400_000
    assert.ok(dias >= 60 && dias <= 64, `el préstamo más antiguo debería tener ~62 días, tiene ${dias.toFixed(1)}`)
  })

  test('deja tres préstamos en mora y uno que vence hoy', async () => {
    await sembrar()

    const { summary, items } = datos<{
      summary: { overdueCount: number; dueTodayCount: number; collectedToday: number }
      items: { daysLate: number; client: { name: string } }[]
    }>(await api('/collections'))

    assert.equal(summary.overdueCount, 3)
    assert.equal(summary.dueTodayCount, 1)
    assert.equal(items.length, 4)
    // el más atrasado es Carlos Rojas (dejó de pagar hace 22 días)
    assert.equal(items[0].client.name, 'Carlos Rojas')
    assert.equal(items[0].daysLate, 22)
  })

  test('los pagos son históricos: ninguno en el futuro y los saldos cuadran con lo pagado', async () => {
    await sembrar()

    const pagos = datos<{ items: { amount: number; paymentDate: string }[]; total: number }>(
      await api('/payments?limit=200')
    )
    assert.ok(pagos.total >= 40, `se esperaban muchos pagos, hay ${pagos.total}`)
    assert.ok(pagos.items.every((p) => new Date(p.paymentDate).getTime() <= Date.now()))

    const creditos = datos<{ items: { totalPaid: number; balance: number; totalAmount: number }[] }>(
      await api('/credits?limit=100')
    )
    for (const c of creditos.items) {
      assert.equal(Math.round(c.totalPaid + c.balance), Math.round(c.totalAmount))
    }
  })

  test('se puede correr varias veces sin duplicar y sin tocar clientes reales', async () => {
    const real = await app.request('POST', '/cobranzas/clients', {
      as: superAdmin,
      body: { name: 'Cliente Real', identification: '999' },
    })
    assert.equal(real.status, 201)

    await sembrar()
    await sembrar()

    const clientes = datos<{ total: number }>(await api('/clients'))
    assert.equal(clientes.total, 7) // 6 del seed + el real
    assert.equal(datos<{ total: number }>(await api('/credits?limit=100')).total, 9)
  })

  test('falla con un mensaje claro si no hay superadmin', async () => {
    await resetTestDb()
    await assert.rejects(sembrar(), /SUPER_ADMIN/)
  })
})
