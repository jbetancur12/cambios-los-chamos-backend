import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { ExchangeRate } from '@/entities/ExchangeRate'
import { ExecutionType, Giro, GiroStatus } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { UserRole } from '@/entities/User'
import { whatsAppNotificationService } from '@/services/WhatsAppNotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createMinorista,
  createOperatorAmount,
  createRate,
  createRechargeAmount,
  createRechargeOperator,
  createTransferencista,
  createUser,
  type MinoristaOptions,
} from './helpers/factories'

// Tasa de las pruebas: compra 90, venta 100, USD 4000, BCV 40.
// 100,000 COP / 100 = 1,000 Bs, y la ganancia total es 100,000 - 1,000 * 90 = 10,000.

type Datos<T> = { data: T }
const datos = <T>(res: { body: unknown }) => (res.body as Datos<T>).data

describe('Crear giros por HTTP: conversión a bolívares, ganancia y validaciones', () => {
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

  const escenario = async (minorista: MinoristaOptions = {}, conTasa = true) => {
    const admin = await createAdmin()
    const superAdmin = await createUser(UserRole.SUPER_ADMIN)
    const bank = await createBank()
    const rate = conTasa ? await createRate(admin) : undefined
    await createAssignmentTracker()
    const transferencista = await createTransferencista()
    const m = await createMinorista({ creditLimit: 1_000_000, ...minorista })
    return { admin, superAdmin, bank, rate, transferencista, m }
  }

  const cuerpo = (bankId: string, cambios: Record<string, unknown> = {}) => ({
    beneficiaryName: 'Ana Pérez',
    beneficiaryId: '123',
    bankId,
    accountNumber: '0102-0001',
    phone: '',
    amountInput: 100_000,
    currencyInput: 'COP',
    ...cambios,
  })

  const giros = () => DI.orm.em.fork().find(Giro, {}, { orderBy: { createdAt: 'DESC' }, populate: ['rateApplied'] })
  const ultimoGiro = async () => (await giros())[0]
  const disponible = async (id: string) => Number((await readFresh(Minorista, id)).availableCredit)

  describe('POST /giro/create: bolívares según la moneda', () => {
    dbTest('COP: los bolívares son el monto dividido entre la tasa de venta', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      assert.equal(res.status, 200)
      const giro = await ultimoGiro()
      assert.equal(Number(giro.amountBs), 1_000)
      assert.equal(Number(giro.amountInput), 100_000)
      assert.equal(giro.currencyInput, 'COP')
      assert.equal(giro.rateApplied.id, w.rate?.id)
      assert.equal(Number(giro.bcvValueApplied), 40)
      assert.equal(giro.status, GiroStatus.ASIGNADO)
    })

    dbTest('VES: los bolívares son el mismo monto, sin conversión', async () => {
      const w = await escenario()

      await app.request('POST', '/giro/create', {
        as: w.admin,
        body: cuerpo(w.bank.id, { amountInput: 5_000, currencyInput: 'VES' }),
      })

      assert.equal(Number((await ultimoGiro()).amountBs), 5_000)
    })

    dbTest('USD: los bolívares son el monto por el valor BCV, y solo lo puede hacer el super admin', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', {
        as: w.superAdmin,
        body: cuerpo(w.bank.id, { amountInput: 10, currencyInput: 'USD' }),
      })

      assert.equal(res.status, 200)
      assert.equal(Number((await ultimoGiro()).amountBs), 400, '10 USD × BCV 40')
    })

    dbTest('un admin y un minorista no pueden enviar dólares y no se crea nada', async () => {
      const w = await escenario()
      for (const user of [w.admin, w.m.user]) {
        const res = await app.request('POST', '/giro/create', {
          as: user,
          body: cuerpo(w.bank.id, { amountInput: 10, currencyInput: 'USD' }),
        })
        assert.equal(res.status, 403, user.role)
      }
      assert.equal((await giros()).length, 0)
      assert.equal(await disponible(w.m.minorista.id), 1_000_000)
    })

    dbTest('los bolívares se guardan con dos decimales', async () => {
      const w = await escenario()
      await createRate(w.admin, { sellRate: 3_950.5, buyRate: 3_900, createdAt: new Date(Date.now() + 5_000) })

      await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      // 100,000 / 3,950.5 = 25.3131...
      assert.equal(Number((await ultimoGiro()).amountBs), 25.31)
    })
  })

  describe('POST /giro/create: la tasa que se aplica', () => {
    dbTest('se usa la última tasa del día creada', async () => {
      const w = await escenario()
      const nueva = await createRate(w.admin, { sellRate: 200, buyRate: 180, createdAt: new Date(Date.now() + 5_000) })

      await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      const giro = await ultimoGiro()
      assert.equal(giro.rateApplied.id, nueva.id)
      assert.equal(Number(giro.amountBs), 500, '100,000 / 200')
    })

    dbTest('una tasa personalizada de un giro no se convierte en la tasa del día', async () => {
      const w = await escenario()
      await createRate(w.admin, { sellRate: 50, buyRate: 45, isCustom: true, createdAt: new Date(Date.now() + 5_000) })

      await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      assert.equal(Number((await ultimoGiro()).amountBs), 1_000, 'sigue usando la tasa normal')
    })

    dbTest('un admin puede aplicar una tasa personalizada a un giro, sin cambiar la del día', async () => {
      const w = await escenario()
      const personalizada = { buyRate: 180, sellRate: 200, usd: 4_100, bcv: 41 }

      const res = await app.request('POST', '/giro/create', {
        as: w.admin,
        body: cuerpo(w.bank.id, { customRate: personalizada }),
      })

      assert.equal(res.status, 200)
      const giro = await ultimoGiro()
      assert.equal(Number(giro.amountBs), 500)
      assert.equal(giro.rateApplied.isCustom, true)
      assert.equal(Number(giro.bcvValueApplied), 41)

      // El siguiente giro sin tasa personalizada vuelve a la del día
      await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })
      assert.equal(Number((await ultimoGiro()).amountBs), 1_000)
    })

    dbTest('un minorista no puede cambiar la tasa de su giro', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', {
        as: w.m.user,
        body: cuerpo(w.bank.id, { customRate: { buyRate: 1, sellRate: 1, usd: 1, bcv: 1 } }),
      })

      assert.equal(res.status, 403)
      assert.equal((await giros()).length, 0)
      assert.equal(
        await DI.orm.em.fork().count(ExchangeRate, { isCustom: true }),
        0,
        'no se creó ninguna tasa personalizada'
      )
    })

    dbTest('la tasa personalizada exige valores mayores a cero', async () => {
      const w = await escenario()
      const res = await app.request('POST', '/giro/create', {
        as: w.admin,
        body: cuerpo(w.bank.id, { customRate: { buyRate: 0, sellRate: 100, usd: 4_000, bcv: 40 } }),
      })
      assert.equal(res.status, 400)
    })

    dbTest('sin ninguna tasa configurada responde 404 y no se crea el giro', async () => {
      const w = await escenario({}, false)

      const res = await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      assert.equal(res.status, 404)
      assert.equal((await giros()).length, 0)
    })
  })

  describe('POST /giro/create: ganancia, quién puede y validaciones', () => {
    dbTest('un giro de admin deja toda la ganancia al sistema', async () => {
      const w = await escenario()
      await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id) })

      const giro = await ultimoGiro()
      assert.equal(Number(giro.systemProfit), 10_000)
      assert.equal(Number(giro.minoristaProfit), 0)
    })

    dbTest('la ganancia sigue la tasa aplicada, también la personalizada', async () => {
      const w = await escenario()
      // compra 95, venta 100: 100,000 - 1,000 × 95 = 5,000
      await app.request('POST', '/giro/create', {
        as: w.admin,
        body: cuerpo(w.bank.id, { customRate: { buyRate: 95, sellRate: 100, usd: 4_000, bcv: 40 } }),
      })

      assert.equal(Number((await ultimoGiro()).systemProfit), 5_000)
    })

    dbTest('un giro de minorista reparte la ganancia: 5% para él y el resto para el sistema', async () => {
      const w = await escenario()
      await app.request('POST', '/giro/create', { as: w.m.user, body: cuerpo(w.bank.id) })

      const giro = await ultimoGiro()
      assert.equal(Number(giro.minoristaProfit), 5_000)
      assert.equal(Number(giro.systemProfit), 5_000)
      assert.equal(await disponible(w.m.minorista.id), 905_000)
    })

    dbTest('un transferencista no puede crear giros', async () => {
      const w = await escenario()
      const res = await app.request('POST', '/giro/create', { as: w.transferencista.user, body: cuerpo(w.bank.id) })
      assert.equal(res.status, 403)
    })

    dbTest('crear un giro exige sesión', async () => {
      const w = await escenario()
      assert.equal((await app.request('POST', '/giro/create', { body: cuerpo(w.bank.id) })).status, 401)
    })

    dbTest('un banco que no existe responde 404', async () => {
      const w = await escenario()
      const res = await app.request('POST', '/giro/create', {
        as: w.admin,
        body: cuerpo('00000000-0000-4000-8000-000000000000'),
      })
      assert.equal(res.status, 404)
      assert.equal((await giros()).length, 0)
    })

    dbTest('rechaza datos inválidos con 400 y no crea nada', async () => {
      const w = await escenario()
      const invalidos: Array<[string, Record<string, unknown>]> = [
        ['monto cero', { amountInput: 0 }],
        ['monto negativo', { amountInput: -500 }],
        ['monto como texto', { amountInput: '100000' }],
        ['moneda desconocida', { currencyInput: 'EUR' }],
        ['sin cédula', { beneficiaryId: '' }],
        ['sin nombre', { beneficiaryName: '' }],
        ['sin cuenta', { accountNumber: '' }],
        ['banco con formato inválido', { bankId: 'no-es-un-uuid' }],
      ]

      for (const [descripcion, cambios] of invalidos) {
        const res = await app.request('POST', '/giro/create', { as: w.admin, body: cuerpo(w.bank.id, cambios) })
        assert.equal(res.status, 400, descripcion)
      }
      assert.equal((await giros()).length, 0)
    })

    dbTest('un minorista sin crédito suficiente recibe 400 y no se crea el giro', async () => {
      const w = await escenario({ availableCredit: 10_000 })

      const res = await app.request('POST', '/giro/create', { as: w.m.user, body: cuerpo(w.bank.id) })

      assert.equal(res.status, 400)
      assert.equal((await giros()).length, 0)
      assert.equal(await disponible(w.m.minorista.id), 10_000)
    })

    dbTest('sin ningún transferencista disponible responde 400 y el minorista no pierde crédito', async () => {
      const admin = await createAdmin()
      const bank = await createBank()
      await createRate(admin)
      await createAssignmentTracker()
      await createTransferencista({ available: false })
      const m = await createMinorista({ creditLimit: 1_000_000 })

      const res = await app.request('POST', '/giro/create', { as: m.user, body: cuerpo(bank.id) })

      assert.equal(res.status, 400)
      assert.equal((await giros()).length, 0)
      assert.equal(await disponible(m.minorista.id), 1_000_000)
    })
  })

  describe('POST /giro/mobile-payment/create: pago móvil', () => {
    const pago = (bankId: string, cambios: Record<string, unknown> = {}) => ({
      cedula: '555',
      bankId,
      phone: '04141234567',
      amountCop: 80_000,
      ...cambios,
    })

    dbTest('crea el giro con los bolívares según la tasa de venta y la cuenta igual al teléfono', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/mobile-payment/create', { as: w.admin, body: pago(w.bank.id) })

      assert.equal(res.status, 201)
      const giro = await ultimoGiro()
      assert.equal(giro.executionType, ExecutionType.PAGO_MOVIL)
      assert.equal(Number(giro.amountBs), 800, '80,000 / 100')
      assert.equal(Number(giro.amountInput), 80_000)
      assert.equal(giro.currencyInput, 'COP')
      assert.equal(giro.accountNumber, '04141234567')
      assert.equal(giro.beneficiaryId, '555')
      assert.equal(giro.bankName, w.bank.name)
      assert.equal(giro.status, GiroStatus.ASIGNADO)
    })

    dbTest('descuenta del minorista como cualquier giro y le devuelve su ganancia del 5%', async () => {
      const w = await escenario({ creditLimit: 100_000 })

      await app.request('POST', '/giro/mobile-payment/create', { as: w.m.user, body: pago(w.bank.id) })

      // 100,000 - 80,000 + 4,000
      assert.equal(await disponible(w.m.minorista.id), 24_000)
    })

    dbTest('reparte la ganancia: 5% para el minorista y el resto para el sistema', async () => {
      const w = await escenario()
      await app.request('POST', '/giro/mobile-payment/create', { as: w.m.user, body: pago(w.bank.id) })

      const giro = await ultimoGiro()
      // Ganancia total 80,000 - 800 × 90 = 8,000; el minorista se lleva 5% de 80,000 = 4,000
      assert.equal(Number(giro.minoristaProfit), 4_000)
      assert.equal(Number(giro.systemProfit), 4_000)
    })

    dbTest('un pago móvil de admin no toca ningún saldo de minorista', async () => {
      const w = await escenario()
      await app.request('POST', '/giro/mobile-payment/create', { as: w.admin, body: pago(w.bank.id) })

      assert.equal(await disponible(w.m.minorista.id), 1_000_000)
      assert.equal(Number((await ultimoGiro()).minoristaProfit), 0)
    })

    dbTest('sin contacto, el nombre del giro es "Pago Móvil"; con contacto, ese contacto', async () => {
      const w = await escenario()
      await app.request('POST', '/giro/mobile-payment/create', { as: w.admin, body: pago(w.bank.id) })
      assert.equal((await ultimoGiro()).beneficiaryName, 'Pago Móvil')

      await app.request('POST', '/giro/mobile-payment/create', {
        as: w.admin,
        body: pago(w.bank.id, { contactoEnvia: 'Carlos Ruiz', cedula: '777' }),
      })
      assert.equal((await ultimoGiro()).beneficiaryName, 'Carlos Ruiz')
    })

    dbTest('exige cédula, banco, teléfono y monto', async () => {
      const w = await escenario()
      for (const campo of ['cedula', 'bankId', 'phone', 'amountCop']) {
        const res = await app.request('POST', '/giro/mobile-payment/create', {
          as: w.admin,
          body: pago(w.bank.id, { [campo]: undefined }),
        })
        assert.equal(res.status, 400, `sin ${campo}`)
      }
      assert.equal((await giros()).length, 0)
    })

    dbTest('la tasa personalizada es solo para admins', async () => {
      const w = await escenario()
      const personalizada = { buyRate: 180, sellRate: 200, usd: 4_100, bcv: 41 }

      const minorista = await app.request('POST', '/giro/mobile-payment/create', {
        as: w.m.user,
        body: pago(w.bank.id, { customRate: personalizada }),
      })
      assert.equal(minorista.status, 403)

      const admin = await app.request('POST', '/giro/mobile-payment/create', {
        as: w.admin,
        body: pago(w.bank.id, { customRate: personalizada }),
      })
      assert.equal(admin.status, 201)
      assert.equal(Number((await ultimoGiro()).amountBs), 400, '80,000 / 200')
    })

    dbTest('con crédito insuficiente responde 400 y no crea nada', async () => {
      const w = await escenario({ availableCredit: 10_000 })

      const res = await app.request('POST', '/giro/mobile-payment/create', { as: w.m.user, body: pago(w.bank.id) })

      assert.equal(res.status, 400)
      assert.equal((await giros()).length, 0)
      assert.equal(await disponible(w.m.minorista.id), 10_000)
    })

    dbTest(
      'exige el monto completo, igual que crear un giro',
      async () => {
        // Con 79,100 disponibles, un giro normal de 80,000 se rechaza; el pago móvil hoy lo acepta
        const w = await escenario({ creditLimit: 100_000, availableCredit: 79_100 })

        const res = await app.request('POST', '/giro/mobile-payment/create', { as: w.m.user, body: pago(w.bank.id) })

        assert.equal(res.status, 400)
      },
      {
        todo: 'Inconsistencia: createGiro rechaza disponible menor al monto, pero createMobilePayment tolera un faltante de hasta el 5% de ganancia',
      }
    )

    dbTest('exige sesión y no lo puede crear un transferencista', async () => {
      const w = await escenario()
      assert.equal((await app.request('POST', '/giro/mobile-payment/create', { body: pago(w.bank.id) })).status, 401)
      assert.equal(
        (
          await app.request('POST', '/giro/mobile-payment/create', {
            as: w.transferencista.user,
            body: pago(w.bank.id),
          })
        ).status,
        403
      )
    })

    dbTest('sin tasa configurada responde 404', async () => {
      const w = await escenario({}, false)
      const res = await app.request('POST', '/giro/mobile-payment/create', { as: w.admin, body: pago(w.bank.id) })
      assert.equal(res.status, 404)
    })
  })

  describe('POST /giro/recharge/create: recarga', () => {
    /** Operador con un monto de 50 Bs disponible. */
    const conOperador = async (minorista: MinoristaOptions = {}, conTasa = true) => {
      const w = await escenario(minorista, conTasa)
      const operador = await createRechargeOperator({ name: 'Movistar' })
      const monto = await createRechargeAmount(w.admin, 50)
      await createOperatorAmount(operador, monto)
      return { ...w, operador, monto }
    }

    const recarga = (
      w: { operador: { id: string }; monto: { id: string } },
      cambios: Record<string, unknown> = {}
    ) => ({
      operatorId: w.operador.id,
      amountBsId: w.monto.id,
      phone: '04141234567',
      contactoEnvia: 'Carlos Ruiz',
      ...cambios,
    })

    dbTest('crea el giro con el monto en bolívares del operador y su equivalente en pesos', async () => {
      const w = await conOperador()

      const res = await app.request('POST', '/giro/recharge/create', { as: w.admin, body: recarga(w) })

      assert.equal(res.status, 201)
      const giro = await ultimoGiro()
      assert.equal(giro.executionType, ExecutionType.RECARGA)
      assert.equal(Number(giro.amountBs), 50)
      assert.equal(Number(giro.amountInput), 5_000, '50 Bs × tasa de venta 100')
      assert.equal(giro.currencyInput, 'COP')
      assert.equal(giro.beneficiaryName, 'Carlos Ruiz')
      assert.equal(giro.beneficiaryId, '04141234567')
      assert.equal(giro.bankName, 'Movistar')
      assert.equal(giro.status, GiroStatus.ASIGNADO)
    })

    dbTest('descuenta del minorista el equivalente en pesos y le devuelve su ganancia del 5%', async () => {
      const w = await conOperador()

      await app.request('POST', '/giro/recharge/create', { as: w.m.user, body: recarga(w) })

      // 1,000,000 - 5,000 + 250
      assert.equal(await disponible(w.m.minorista.id), 995_250)
    })

    dbTest('reparte la ganancia: 5% para el minorista y el resto para el sistema', async () => {
      const w = await conOperador()
      await app.request('POST', '/giro/recharge/create', { as: w.m.user, body: recarga(w) })

      const giro = await ultimoGiro()
      // Ganancia total 5,000 - 50 × 90 = 500; el minorista se lleva 5% de 5,000 = 250
      assert.equal(Number(giro.minoristaProfit), 250)
      assert.equal(Number(giro.systemProfit), 250)
    })

    dbTest('exige operador, monto, teléfono y contacto', async () => {
      const w = await conOperador()
      for (const campo of ['operatorId', 'amountBsId', 'phone', 'contactoEnvia']) {
        const res = await app.request('POST', '/giro/recharge/create', {
          as: w.admin,
          body: recarga(w, { [campo]: undefined }),
        })
        assert.equal(res.status, 400, `sin ${campo}`)
      }
      assert.equal((await giros()).length, 0)
    })

    dbTest('un monto que ese operador no ofrece se rechaza', async () => {
      const w = await conOperador()
      const otroMonto = await createRechargeAmount(w.admin, 200) // existe, pero no está ligado al operador

      const res = await app.request('POST', '/giro/recharge/create', {
        as: w.admin,
        body: recarga(w, { amountBsId: otroMonto.id }),
      })

      assert.equal(res.status, 400)
      assert.equal((await giros()).length, 0)
    })

    dbTest('un monto que se desactivó para ese operador ya no se puede recargar', async () => {
      const w = await escenario()
      const operador = await createRechargeOperator()
      const monto = await createRechargeAmount(w.admin, 50)
      await createOperatorAmount(operador, monto, false)

      const res = await app.request('POST', '/giro/recharge/create', {
        as: w.admin,
        body: recarga({ operador, monto }),
      })

      assert.equal(res.status, 400)
    })

    dbTest('con crédito insuficiente responde 400 y no crea nada', async () => {
      const w = await conOperador({ availableCredit: 1_000 })

      const res = await app.request('POST', '/giro/recharge/create', { as: w.m.user, body: recarga(w) })

      assert.equal(res.status, 400)
      assert.equal((await giros()).length, 0)
      assert.equal(await disponible(w.m.minorista.id), 1_000)
    })

    dbTest('exige sesión y no lo puede crear un transferencista', async () => {
      const w = await conOperador()
      assert.equal((await app.request('POST', '/giro/recharge/create', { body: recarga(w) })).status, 401)
      assert.equal(
        (await app.request('POST', '/giro/recharge/create', { as: w.transferencista.user, body: recarga(w) })).status,
        403
      )
    })

    dbTest('sin tasa configurada responde 404', async () => {
      const w = await conOperador({}, false)
      const res = await app.request('POST', '/giro/recharge/create', { as: w.admin, body: recarga(w) })
      assert.equal(res.status, 404)
    })

    dbTest('una recarga de admin no toca saldos de minoristas', async () => {
      const w = await conOperador()
      await app.request('POST', '/giro/recharge/create', { as: w.admin, body: recarga(w) })

      assert.equal(await disponible(w.m.minorista.id), 1_000_000)
      const giro = await ultimoGiro()
      assert.equal(Number(giro.systemProfit), 500)
      assert.equal(Number(giro.minoristaProfit), 0)
    })

    dbTest('la respuesta incluye el giro creado', async () => {
      const w = await conOperador()
      const res = await app.request('POST', '/giro/recharge/create', { as: w.admin, body: recarga(w) })
      assert.ok(datos<{ giro: Giro }>(res).giro.id)
    })
  })
})
