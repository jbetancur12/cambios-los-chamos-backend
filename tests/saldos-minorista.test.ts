import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { ExecutionType, Giro } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { MinoristaTransaction, MinoristaTransactionType } from '@/entities/MinoristaTransaction'
import { UserRole } from '@/entities/User'
import { giroService } from '@/services/GiroService'
import { whatsAppNotificationService } from '@/services/WhatsAppNotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createBankAccount,
  createMinorista,
  createRate,
  createTransferencista,
  createUser,
  giroInput,
  type MinoristaOptions,
} from './helpers/factories'

type Datos<T> = { data: T }
const datos = <T>(res: { body: unknown }) => (res.body as Datos<T>).data

describe('Saldos del minorista: recargas, ajustes, pago de deuda, cupo y libro de movimientos', () => {
  let app: TestApp

  before(async () => {
    mock.method(whatsAppNotificationService, 'notifyGiroCompleted', async () => undefined)
    await setupTestDb()
    app = await startTestApp()
  })
  beforeEach(resetTestDb)
  after(async () => {
    mock.restoreAll()
    await app.close()
    await closeTestDb()
  })

  const escenario = async (minorista: MinoristaOptions = {}) => {
    const admin = await createAdmin()
    const superAdmin = await createUser(UserRole.SUPER_ADMIN)
    const m = await createMinorista({ creditLimit: 100_000, ...minorista })
    return { admin, superAdmin, m }
  }

  const estado = async (id: string) => {
    const m = await readFresh(Minorista, id)
    return { disponible: Number(m.availableCredit), aFavor: Number(m.creditBalance), cupo: Number(m.creditLimit) }
  }

  const libro = (id: string) =>
    DI.orm.em.fork().find(MinoristaTransaction, { minorista: id }, { orderBy: { createdAt: 'ASC' } })

  const crear = (as: Parameters<TestApp['request']>[2], minoristaId: string, amount: number, type: string) =>
    app.request('POST', '/minorista-transaction/create', { ...as, body: { minoristaId, amount, type } })

  describe('recargas y ajustes: POST /minorista-transaction/create', () => {
    dbTest('una recarga repone el crédito disponible y queda en el libro', async () => {
      const w = await escenario({ availableCredit: 60_000 })

      const res = await crear({ as: w.admin }, w.m.minorista.id, 30_000, 'RECHARGE')

      assert.equal(res.status, 201)
      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 90_000, aFavor: 0, cupo: 100_000 })
      const [movimiento] = await libro(w.m.minorista.id)
      assert.equal(movimiento.type, MinoristaTransactionType.RECHARGE)
      assert.equal(Number(movimiento.amount), 30_000)
      assert.equal(Number(movimiento.previousAvailableCredit), 60_000)
      assert.equal(Number(movimiento.availableCredit), 90_000)
      assert.equal(movimiento.createdBy.id, w.admin.id, 'queda quién la hizo')
    })

    dbTest('una recarga que pasa del cupo llena el crédito y el resto va al saldo a favor', async () => {
      const w = await escenario({ availableCredit: 90_000 })

      await crear({ as: w.admin }, w.m.minorista.id, 30_000, 'RECHARGE')

      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 100_000, aFavor: 20_000, cupo: 100_000 })
    })

    dbTest('con el crédito completo, la recarga entera va al saldo a favor', async () => {
      const w = await escenario()

      await crear({ as: w.admin }, w.m.minorista.id, 25_000, 'RECHARGE')

      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 100_000, aFavor: 25_000, cupo: 100_000 })
    })

    dbTest('el super admin también puede recargar', async () => {
      const w = await escenario({ availableCredit: 50_000 })
      const res = await crear({ as: w.superAdmin }, w.m.minorista.id, 10_000, 'RECHARGE')
      assert.equal(res.status, 201)
      assert.equal((await estado(w.m.minorista.id)).disponible, 60_000)
    })

    dbTest('un ajuste suma al crédito disponible', async () => {
      const w = await escenario({ availableCredit: 50_000 })

      const res = await crear({ as: w.admin }, w.m.minorista.id, 10_000, 'ADJUSTMENT')

      assert.equal(res.status, 201)
      assert.equal((await estado(w.m.minorista.id)).disponible, 60_000)
    })

    dbTest(
      'un ajuste no puede dejar el crédito disponible por encima del cupo',
      async () => {
        const w = await escenario({ availableCredit: 95_000 })

        await crear({ as: w.admin }, w.m.minorista.id, 30_000, 'ADJUSTMENT')

        const { disponible, cupo } = await estado(w.m.minorista.id)
        assert.ok(disponible <= cupo, `disponible ${disponible} no debe superar el cupo ${cupo}`)
      },
      {
        todo: 'Inconsistencia: el ajuste suma sin tope, a diferencia de la recarga, que manda el exceso al saldo a favor',
      }
    )

    dbTest('un reembolso suelto, sin giro, le acredita el 95% del monto (comportamiento actual)', async () => {
      // Pregunta de negocio: hoy la ruta acepta cualquier tipo de movimiento, también descuentos y reembolsos.
      const w = await escenario({ availableCredit: 40_000 })

      const res = await crear({ as: w.admin }, w.m.minorista.id, 20_000, 'REFUND')

      assert.equal(res.status, 201)
      assert.equal((await estado(w.m.minorista.id)).disponible, 59_000, '40,000 + 95% de 20,000')
    })

    dbTest('exige un monto mayor a cero y un tipo válido', async () => {
      const w = await escenario()
      for (const [amount, type] of [
        [0, 'RECHARGE'],
        [-5_000, 'RECHARGE'],
        [5_000, 'INVENTADO'],
      ] as const) {
        const res = await crear({ as: w.admin }, w.m.minorista.id, amount, type)
        assert.equal(res.status, 400, `${amount} ${type}`)
      }
      assert.equal((await libro(w.m.minorista.id)).length, 0)
    })

    dbTest('un minorista que no existe responde 404', async () => {
      const w = await escenario()
      const res = await crear({ as: w.admin }, '00000000-0000-4000-8000-000000000000', 5_000, 'RECHARGE')
      assert.equal(res.status, 404)
    })

    dbTest('un minorista, un transferencista y quien no tiene sesión no pueden crear movimientos', async () => {
      const w = await escenario()
      const t = await createTransferencista()

      assert.equal((await crear({ as: w.m.user }, w.m.minorista.id, 5_000, 'RECHARGE')).status, 403)
      assert.equal((await crear({ as: t.user }, w.m.minorista.id, 5_000, 'RECHARGE')).status, 403)
      assert.equal((await crear({}, w.m.minorista.id, 5_000, 'RECHARGE')).status, 401)
      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 100_000, aFavor: 0, cupo: 100_000 })
    })
  })

  describe('pago de deuda: POST /minorista/:id/pay-debt', () => {
    const pagar = (as: Parameters<TestApp['request']>[2], minoristaId: string, amount: unknown) =>
      app.request('POST', `/minorista/${minoristaId}/pay-debt`, { ...as, body: { amount } })

    dbTest('pagar una parte de la deuda repone esa parte', async () => {
      const w = await escenario({ availableCredit: 60_000 })

      const res = await pagar({ as: w.admin }, w.m.minorista.id, 30_000)

      assert.equal(res.status, 200)
      assert.equal(datos<{ minorista: { debtAmount: number } }>(res).minorista.debtAmount, 10_000)
      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 90_000, aFavor: 0, cupo: 100_000 })
    })

    dbTest('pagar exactamente la deuda deja el crédito completo y sin saldo a favor', async () => {
      const w = await escenario({ availableCredit: 60_000 })

      await pagar({ as: w.admin }, w.m.minorista.id, 40_000)

      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 100_000, aFavor: 0, cupo: 100_000 })
    })

    dbTest('pagar más que la deuda manda el exceso al saldo a favor y lo deja en dos movimientos', async () => {
      const w = await escenario({ availableCredit: 60_000 })

      await pagar({ as: w.admin }, w.m.minorista.id, 50_000)

      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 100_000, aFavor: 10_000, cupo: 100_000 })
      const movimientos = await libro(w.m.minorista.id)
      assert.equal(movimientos.length, 2, 'uno por la deuda y otro por el exceso')
      assert.deepEqual(
        movimientos.map((t) => Number(t.amount)).sort((a, b) => a - b),
        [10_000, 40_000]
      )
    })

    dbTest('un minorista puede pagar su propia deuda', async () => {
      const w = await escenario({ availableCredit: 60_000 })
      const res = await pagar({ as: w.m.user }, w.m.minorista.id, 20_000)
      assert.equal(res.status, 200)
      assert.equal((await estado(w.m.minorista.id)).disponible, 80_000)
    })

    dbTest('un minorista no puede pagar la deuda de otro', async () => {
      const w = await escenario({ availableCredit: 60_000 })
      const otro = await createMinorista({ creditLimit: 100_000, availableCredit: 60_000 })

      const res = await pagar({ as: otro.user }, w.m.minorista.id, 20_000)

      assert.equal(res.status, 403)
      assert.equal((await estado(w.m.minorista.id)).disponible, 60_000)
    })

    dbTest('el monto no puede ser cero, y un minorista no puede mandar un monto negativo', async () => {
      const w = await escenario({ availableCredit: 60_000 })

      assert.equal((await pagar({ as: w.admin }, w.m.minorista.id, 0)).status, 400)
      assert.equal((await pagar({ as: w.m.user }, w.m.minorista.id, -10_000)).status, 400)
      assert.equal((await pagar({ as: w.admin }, w.m.minorista.id, undefined)).status, 400)
      assert.equal((await estado(w.m.minorista.id)).disponible, 60_000)
    })

    dbTest('pagar la deuda de un minorista que no existe responde 404', async () => {
      const w = await escenario()
      const res = await pagar({ as: w.admin }, '00000000-0000-4000-8000-000000000000', 1_000)
      assert.equal(res.status, 404)
    })

    dbTest('exige sesión y un transferencista no puede pagar deudas', async () => {
      const w = await escenario({ availableCredit: 60_000 })
      const t = await createTransferencista()
      assert.equal((await pagar({}, w.m.minorista.id, 1_000)).status, 401)
      assert.equal((await pagar({ as: t.user }, w.m.minorista.id, 1_000)).status, 403)
    })

    dbTest(
      'un monto negativo de un admin no puede dejar el crédito disponible por debajo de cero',
      async () => {
        const w = await escenario()

        await pagar({ as: w.admin }, w.m.minorista.id, -500_000)

        assert.ok((await estado(w.m.minorista.id)).disponible >= 0, 'el crédito disponible no puede ser negativo')
      },
      { todo: 'Bug conocido (informe): pay-debt acepta montos negativos de un admin sin ningún tope' }
    )
  })

  describe('cupo de crédito: POST /minorista/:id/credit-limit', () => {
    const cambiarCupo = (as: Parameters<TestApp['request']>[2], minoristaId: string, creditLimit: unknown) =>
      app.request('POST', `/minorista/${minoristaId}/credit-limit`, { ...as, body: { creditLimit } })

    dbTest('subir el cupo conserva lo ya usado: el disponible sube lo mismo', async () => {
      const w = await escenario({ availableCredit: 60_000 }) // usado: 40,000

      const res = await cambiarCupo({ as: w.admin }, w.m.minorista.id, 150_000)

      assert.equal(res.status, 200)
      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 110_000, aFavor: 0, cupo: 150_000 })
    })

    dbTest('bajar el cupo conserva lo ya usado: el disponible baja lo mismo', async () => {
      const w = await escenario({ availableCredit: 60_000 }) // usado: 40,000

      await cambiarCupo({ as: w.admin }, w.m.minorista.id, 50_000)

      assert.deepEqual(await estado(w.m.minorista.id), { disponible: 10_000, aFavor: 0, cupo: 50_000 })
    })

    dbTest(
      'no se puede bajar el cupo por debajo de lo que el minorista ya usó',
      async () => {
        const w = await escenario({ availableCredit: 60_000 }) // usado: 40,000

        const res = await cambiarCupo({ as: w.admin }, w.m.minorista.id, 30_000)

        assert.equal(res.status, 400)
        assert.ok((await estado(w.m.minorista.id)).disponible >= 0)
      },
      { todo: 'Bug conocido: con un cupo menor a lo usado, el crédito disponible queda negativo sin ningún aviso' }
    )

    dbTest(
      'cambiar el cupo deja un movimiento en el libro',
      async () => {
        const w = await escenario({ availableCredit: 60_000 })

        await cambiarCupo({ as: w.admin }, w.m.minorista.id, 150_000)

        assert.equal((await libro(w.m.minorista.id)).length, 1, 'el cambio de saldo debe quedar registrado')
      },
      {
        todo: 'Hueco: setCreditLimit cambia el crédito disponible sin dejar ningún movimiento, así que el libro ya no explica el saldo',
      }
    )

    dbTest('exige un cupo mayor a cero', async () => {
      const w = await escenario()
      for (const valor of [0, -1_000, undefined]) {
        assert.equal((await cambiarCupo({ as: w.admin }, w.m.minorista.id, valor)).status, 400, String(valor))
      }
      assert.equal((await estado(w.m.minorista.id)).cupo, 100_000)
    })

    dbTest('solo admins cambian el cupo, y el minorista tiene que existir', async () => {
      const w = await escenario()
      assert.equal((await cambiarCupo({ as: w.m.user }, w.m.minorista.id, 500_000)).status, 403)
      assert.equal((await cambiarCupo({}, w.m.minorista.id, 500_000)).status, 401)
      assert.equal((await cambiarCupo({ as: w.admin }, '00000000-0000-4000-8000-000000000000', 500_000)).status, 404)
      assert.equal((await estado(w.m.minorista.id)).cupo, 100_000)
    })
  })

  describe('el libro de movimientos explica el saldo', () => {
    /** Misma lista de operaciones para las dos pruebas: giros, devoluciones, ejecuciones, recargas y pagos. */
    const secuencia = async () => {
      const admin = await createAdmin()
      const bank = await createBank()
      const rate = await createRate(admin)
      await createAssignmentTracker()
      const t1 = await createTransferencista()
      const cuenta = await createBankAccount(t1.transferencista, bank)
      const m = await createMinorista({ creditLimit: 1_000_000 })
      const id = m.minorista.id

      const giro = async (monto: number) => {
        const r = await giroService.createGiro(
          giroInput(bank, rate, { minoristaId: id, amountInput: monto, amountBs: monto / 100 }),
          m.user
        )
        assert.ok(!('error' in r), `error inesperado: ${JSON.stringify(r)}`)
        return r as Giro
      }

      // Cada paso lleva el cambio esperado en (disponible + saldo a favor), calculado a mano:
      // un giro resta el monto y suma el 5% de ganancia; un reembolso suma el 95%; una recarga o ajuste suman el monto.
      const pasos: Array<{ nombre: string; cambio: number; hacer: () => Promise<unknown> }> = []
      let g1: Giro, g2: Giro, g4: Giro
      pasos.push({ nombre: 'giro de 100,000', cambio: -95_000, hacer: async () => void (g1 = await giro(100_000)) })
      pasos.push({
        nombre: 'recarga de 20,000',
        cambio: 20_000,
        hacer: () =>
          app.request('POST', '/minorista-transaction/create', {
            as: admin,
            body: { minoristaId: id, amount: 20_000, type: 'RECHARGE' },
          }),
      })
      pasos.push({ nombre: 'giro de 300,000', cambio: -285_000, hacer: async () => void (g2 = await giro(300_000)) })
      pasos.push({
        nombre: 'devolución del primer giro',
        cambio: 95_000,
        hacer: () => giroService.returnGiro(g1.id, 'Cuenta inválida', admin),
      })
      pasos.push({
        nombre: 'ajuste de 10,000',
        cambio: 10_000,
        hacer: () =>
          app.request('POST', '/minorista-transaction/create', {
            as: admin,
            body: { minoristaId: id, amount: 10_000, type: 'ADJUSTMENT' },
          }),
      })
      pasos.push({
        nombre: 'pago de deuda de 50,000',
        cambio: 50_000,
        hacer: () => app.request('POST', `/minorista/${id}/pay-debt`, { as: admin, body: { amount: 50_000 } }),
      })
      pasos.push({
        nombre: 'ejecución del segundo giro',
        cambio: 0,
        hacer: () => giroService.executeGiro(g2.id, cuenta.id, ExecutionType.TRANSFERENCIA, 10, t1.user),
      })
      pasos.push({ nombre: 'giro de 50,000', cambio: -47_500, hacer: async () => void (await giro(50_000)) })
      pasos.push({
        nombre: 'recarga de 400,000, que pasa del cupo',
        cambio: 400_000,
        hacer: () =>
          app.request('POST', '/minorista-transaction/create', {
            as: admin,
            body: { minoristaId: id, amount: 400_000, type: 'RECHARGE' },
          }),
      })
      pasos.push({
        nombre: 'giro de 200,000 pagado con saldo a favor y crédito',
        cambio: -190_000,
        hacer: async () => void (g4 = await giro(200_000)),
      })
      pasos.push({
        nombre: 'cancelación de ese giro',
        cambio: 190_000,
        hacer: () => giroService.deleteGiro(g4.id, m.user),
      })
      return { id, pasos }
    }

    const cerca = (a: number, b: number) => Math.abs(a - b) < 0.01

    dbTest(
      'en cada paso, disponible + saldo a favor cambia exactamente lo esperado y nunca queda fuera de rango',
      async () => {
        const { id, pasos } = await secuencia()
        let esperado = 1_000_000

        for (const paso of pasos) {
          await paso.hacer()
          esperado += paso.cambio
          const { disponible, aFavor, cupo } = await estado(id)
          assert.ok(
            cerca(disponible + aFavor, esperado),
            `${paso.nombre}: ${disponible} + ${aFavor} debía sumar ${esperado}`
          )
          assert.ok(disponible <= cupo, `${paso.nombre}: el disponible ${disponible} supera el cupo ${cupo}`)
          assert.ok(disponible >= 0 && aFavor >= 0, `${paso.nombre}: ningún saldo puede ser negativo`)
        }
      }
    )

    dbTest(
      'cada movimiento empieza donde terminó el anterior y el último coincide con el saldo del minorista',
      async () => {
        const { id, pasos } = await secuencia()
        for (const paso of pasos) await paso.hacer()

        const movimientos = await libro(id)
        // Ejecutar un giro no crea un movimiento: solo pasa el descuento de en espera a completado
        assert.equal(movimientos.length, pasos.length - 1, 'cada operación que mueve saldo dejó su movimiento')

        for (let i = 1; i < movimientos.length; i++) {
          const anterior = movimientos[i - 1]
          const actual = movimientos[i]
          assert.ok(
            cerca(Number(actual.previousAvailableCredit), Number(anterior.availableCredit)),
            `movimiento ${i}: el disponible previo ${actual.previousAvailableCredit} no es el final del anterior ${anterior.availableCredit}`
          )
          assert.ok(
            cerca(Number(actual.previousBalanceInFavor ?? 0), Number(anterior.currentBalanceInFavor ?? 0)),
            `movimiento ${i}: el saldo a favor previo no es el final del anterior`
          )
        }

        const ultimo = movimientos[movimientos.length - 1]
        const { disponible, aFavor } = await estado(id)
        assert.ok(
          cerca(Number(ultimo.availableCredit), disponible),
          'el último movimiento termina en el crédito disponible actual'
        )
        assert.ok(cerca(Number(ultimo.currentBalanceInFavor ?? 0), aFavor), 'y en el saldo a favor actual')
      }
    )

    dbTest('un minorista ve sus movimientos y un admin los de cualquiera, pero no los de otro minorista', async () => {
      const w = await escenario({ availableCredit: 60_000 })
      await crear({ as: w.admin }, w.m.minorista.id, 10_000, 'RECHARGE')
      const otro = await createMinorista()

      const propio = await app.request('GET', `/minorista/${w.m.minorista.id}/transactions`, { as: w.m.user })
      const admin = await app.request('GET', `/minorista/${w.m.minorista.id}/transactions`, { as: w.admin })
      const ajeno = await app.request('GET', `/minorista/${w.m.minorista.id}/transactions`, { as: otro.user })

      assert.equal(propio.status, 200)
      assert.equal(datos<{ transactions: unknown[] }>(propio).transactions.length, 1)
      assert.equal(admin.status, 200)
      assert.equal(ajeno.status, 403)
    })

    dbTest('las fechas inválidas en la lista de movimientos responden 400', async () => {
      const w = await escenario()
      const res = await app.request('GET', `/minorista/${w.m.minorista.id}/transactions?startDate=no-es-fecha`, {
        as: w.admin,
      })
      assert.equal(res.status, 400)
    })
  })
})
