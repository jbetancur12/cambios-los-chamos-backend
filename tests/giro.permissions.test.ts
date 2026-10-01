import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { ExecutionType, Giro, GiroStatus } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
import { MinoristaTransaction } from '@/entities/MinoristaTransaction'
import { UserRole } from '@/entities/User'
import { giroService } from '@/services/GiroService'
import { transferencistaService } from '@/services/TransferencistaService'
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
} from './helpers/factories'

/**
 * Who may do what with a giro, tested through the real HTTP routes.
 * A test marked `todo` asserts the correct rule and fails today because the route does not enforce it.
 */

const FORBIDDEN = 403
const OK = 200

describe('Permisos de giros (HTTP)', () => {
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

  /**
   * Minorista A created a giro that was assigned to transferencista T1.
   * B is another minorista and T2 another transferencista, both with nothing to do with it.
   */
  const world = async () => {
    const admin = await createAdmin()
    const superAdmin = await createUser(UserRole.SUPER_ADMIN)
    const bank = await createBank()
    const rate = await createRate(admin)
    const t1 = await createTransferencista()
    const account1 = await createBankAccount(t1.transferencista, bank)
    await createAssignmentTracker()
    const a = await createMinorista({ creditLimit: 100_000 })
    const b = await createMinorista({ creditLimit: 100_000 })

    // T1 is the only transferencista when the giro is created, so it is the one assigned
    const created = await giroService.createGiro(
      giroInput(bank, rate, { minoristaId: a.minorista.id, amountInput: 80_000, amountBs: 1_000 }),
      a.user
    )
    assert.ok(!('error' in created), `error inesperado: ${JSON.stringify(created)}`)
    const giro = created as Giro

    const t2 = await createTransferencista()
    const account2 = await createBankAccount(t2.transferencista, bank)
    return { admin, superAdmin, bank, rate, t1, account1, t2, account2, a, b, giro }
  }

  const status = async (id: string) => (await readFresh(Giro, id)).status
  const available = async (id: string) => Number((await readFresh(Minorista, id)).availableCredit)

  describe('Leer un giro: GET /giro/:id', () => {
    dbTest('exige una sesión', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`)).status, 401)
    })

    dbTest('el minorista que lo creó, su transferencista y un admin pueden leerlo', async () => {
      const w = await world()
      for (const user of [w.a.user, w.t1.user, w.admin]) {
        assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: user })).status, OK, user.role)
      }
    })

    dbTest('otro minorista y otro transferencista no pueden leerlo', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: w.b.user })).status, FORBIDDEN)
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: w.t2.user })).status, FORBIDDEN)
    })
  })

  describe('Editar un giro: PATCH /giro/:id', () => {
    dbTest('el minorista que lo creó puede editar el beneficiario', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { beneficiaryName: 'Nuevo nombre' },
      })
      assert.equal(res.status, OK)
      assert.equal((await readFresh(Giro, w.giro.id)).beneficiaryName, 'Nuevo nombre')
    })

    dbTest('un transferencista no puede editarlo', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, { as: w.t1.user, body: { beneficiaryName: 'x' } })
      assert.equal(res.status, FORBIDDEN)
    })

    dbTest('otro minorista no puede editarlo', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.b.user,
        body: { accountNumber: '99990000' },
      })
      assert.equal(res.status, FORBIDDEN)
      assert.notEqual((await readFresh(Giro, w.giro.id)).accountNumber, '99990000', 'la cuenta no cambió')
    })

    dbTest('otro minorista no puede reenviar un giro devuelto ni cobrárselo a su dueño', async () => {
      const w = await world()
      await giroService.returnGiro(w.giro.id, 'Devuelto', w.admin)
      assert.equal(await available(w.a.minorista.id), 100_000)

      await app.request('PATCH', `/giro/${w.giro.id}`, { as: w.b.user, body: { beneficiaryName: 'x' } })

      assert.equal(await status(w.giro.id), GiroStatus.DEVUELTO, 'el giro sigue devuelto')
      assert.equal(await available(w.a.minorista.id), 100_000, 'el crédito de A no se cobró')
    })

    dbTest('un giro completado no se puede editar', async () => {
      const w = await world()
      await giroService.executeGiro(w.giro.id, w.account1.id, ExecutionType.TRANSFERENCIA, 10, w.t1.user)
      assert.equal(await status(w.giro.id), GiroStatus.COMPLETADO)

      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { accountNumber: '99990000' },
      })

      assert.notEqual(res.status, OK)
      assert.notEqual((await readFresh(Giro, w.giro.id)).accountNumber, '99990000', 'la cuenta destino no cambió')
    })
  })

  describe('Editar un giro: quién y cuándo', () => {
    dbTest('un admin puede editar un giro asignado', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.admin,
        body: { beneficiaryName: 'Corregido por admin' },
      })
      assert.equal(res.status, OK)
      assert.equal((await readFresh(Giro, w.giro.id)).beneficiaryName, 'Corregido por admin')
    })

    dbTest('un giro en procesamiento no se puede editar', async () => {
      const w = await world()
      await giroService.markAsProcessing(w.giro.id, w.t1.user)

      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { accountNumber: '99990000' },
      })

      assert.equal(res.status, 400)
      assert.notEqual((await readFresh(Giro, w.giro.id)).accountNumber, '99990000')
    })

    dbTest('un giro cancelado no se puede editar', async () => {
      const w = await world()
      await giroService.deleteGiro(w.giro.id, w.a.user)

      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { accountNumber: '99990000' },
      })

      assert.equal(res.status, 400)
      assert.equal(await status(w.giro.id), GiroStatus.CANCELADO)
    })

    dbTest('el dueño puede corregir y reenviar un giro devuelto, y se le cobra de nuevo', async () => {
      const w = await world()
      await giroService.returnGiro(w.giro.id, 'Cuenta inválida', w.admin)
      assert.equal(await available(w.a.minorista.id), 100_000)

      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { accountNumber: '01029999' },
      })

      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
      assert.equal(await available(w.a.minorista.id), 24_000)
    })
  })

  describe('Ejecutar un giro: POST /giro/:id/execute', () => {
    const body = (accountId: string) => ({ bankAccountId: accountId, executionType: 'TRANSFERENCIA', fee: 10 })

    dbTest('un minorista y un admin no pueden ejecutar giros', async () => {
      const w = await world()
      for (const user of [w.a.user, w.admin]) {
        const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: user, body: body(w.account1.id) })
        assert.equal(res.status, FORBIDDEN, user.role)
      }
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('el transferencista asignado puede ejecutarlo con su propia cuenta', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: w.t1.user, body: body(w.account1.id) })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.COMPLETADO)
    })

    dbTest('un transferencista no puede ejecutarlo con una cuenta que no es suya', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: w.t1.user, body: body(w.account2.id) })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('un transferencista no puede ejecutar un giro asignado a otro transferencista', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/execute`, {
        as: w.t2.user,
        body: body(w.account2.id),
      })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })
  })

  describe('Devolver y tomar un giro: POST /giro/:id/return y /mark-processing', () => {
    dbTest('un minorista no puede devolver un giro', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.a.user, body: { reason: 'x' } })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('el transferencista asignado puede devolverlo', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, {
        as: w.t1.user,
        body: { reason: 'Cuenta inválida' },
      })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.DEVUELTO)
    })

    dbTest('un admin puede devolverlo', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.admin, body: { reason: 'Revisión' } })
      assert.equal(res.status, OK)
    })

    dbTest('un transferencista no puede devolver un giro asignado a otro transferencista', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.t2.user, body: { reason: 'x' } })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('un transferencista no puede tomar un giro asignado a otro transferencista', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/mark-processing`, { as: w.t2.user })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })
  })

  describe('Cancelar un giro: DELETE /giro/:id', () => {
    dbTest('otro minorista no puede cancelarlo', async () => {
      const w = await world()
      assert.equal((await app.request('DELETE', `/giro/${w.giro.id}`, { as: w.b.user })).status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('el minorista que lo creó puede cancelarlo', async () => {
      const w = await world()
      assert.equal((await app.request('DELETE', `/giro/${w.giro.id}`, { as: w.a.user })).status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.CANCELADO)
    })
  })

  describe('Leer los datos de otro minorista', () => {
    dbTest('un minorista puede leer su propia cuenta y sus movimientos', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.a.user })).status, OK)
      assert.equal(
        (await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, { as: w.a.user })).status,
        OK
      )
    })

    dbTest('un minorista no puede leer el saldo de otro minorista', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.b.user })).status, FORBIDDEN)
    })

    dbTest('un minorista no puede leer los movimientos de otro minorista', async () => {
      const w = await world()
      const res = await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, {
        as: w.b.user,
      })
      assert.equal(res.status, FORBIDDEN)
    })
  })

  describe('Reasignar un giro cambia quién puede actuar sobre él', () => {
    const executeBody = (accountId: string) => ({ bankAccountId: accountId, executionType: 'TRANSFERENCIA', fee: 10 })

    dbTest('tras reasignarlo un admin, el nuevo transferencista puede ejecutarlo y el anterior no', async () => {
      const w = await world()
      const reassigned = await giroService.reassignGiro(w.giro.id, w.t2.transferencista.id, w.admin)
      assert.ok(!('error' in reassigned), `error inesperado: ${JSON.stringify(reassigned)}`)

      const previous = await app.request('POST', `/giro/${w.giro.id}/execute`, {
        as: w.t1.user,
        body: executeBody(w.account1.id),
      })
      assert.equal(previous.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)

      const current = await app.request('POST', `/giro/${w.giro.id}/execute`, {
        as: w.t2.user,
        body: executeBody(w.account2.id),
      })
      assert.equal(current.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.COMPLETADO)
    })

    dbTest('al deshabilitar un transferencista sus giros pasan a otro, que ya puede actuar sobre ellos', async () => {
      const w = await world()

      const disabled = await transferencistaService.setAvailability(w.t1.transferencista.id, false)
      assert.ok('success' in disabled, `resultado inesperado: ${JSON.stringify(disabled)}`)

      const moved = await DI.orm.em.fork().findOneOrFail(Giro, { id: w.giro.id }, { populate: ['transferencista'] })
      assert.equal(
        moved.transferencista?.id,
        w.t2.transferencista.id,
        'el giro se reasignó al transferencista disponible'
      )

      const previous = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.t1.user, body: { reason: 'x' } })
      assert.equal(previous.status, FORBIDDEN)
      const current = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.t2.user, body: { reason: 'x' } })
      assert.equal(current.status, OK)
    })

    dbTest('el super admin puede tomar un giro asignado a cualquiera', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/mark-processing`, { as: w.superAdmin })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.PROCESANDO)
    })

    dbTest('el transferencista asignado puede tomar su propio giro', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/mark-processing`, { as: w.t1.user })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.PROCESANDO)
    })
  })

  describe('Datos de minorista: quién puede leerlos', () => {
    dbTest('un admin puede leer cualquier minorista, sus movimientos y la lista de minoristas', async () => {
      const w = await world()
      const transaction = await DI.orm.em.fork().findOneOrFail(MinoristaTransaction, { giro: w.giro.id })

      assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.admin })).status, OK)
      assert.equal(
        (await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, { as: w.admin })).status,
        OK
      )
      assert.equal((await app.request('GET', `/minorista-transaction/${transaction.id}`, { as: w.admin })).status, OK)
      assert.equal((await app.request('GET', '/minorista/list', { as: w.admin })).status, OK)
    })

    dbTest('un transferencista no puede leer saldos ni movimientos de minoristas', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.t1.user })).status, FORBIDDEN)
      assert.equal(
        (await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, { as: w.t1.user })).status,
        FORBIDDEN
      )
    })

    dbTest('un minorista puede leer su propia transacción pero no la de otro minorista', async () => {
      const w = await world()
      const transaction = await DI.orm.em.fork().findOneOrFail(MinoristaTransaction, { giro: w.giro.id })

      assert.equal((await app.request('GET', `/minorista-transaction/${transaction.id}`, { as: w.a.user })).status, OK)
      assert.equal(
        (await app.request('GET', `/minorista-transaction/${transaction.id}`, { as: w.b.user })).status,
        FORBIDDEN
      )
    })

    dbTest('solo los admins pueden listar a todos los minoristas', async () => {
      const w = await world()
      assert.equal((await app.request('GET', '/minorista/list', { as: w.a.user })).status, FORBIDDEN)
      assert.equal((await app.request('GET', '/minorista/list', { as: w.t1.user })).status, FORBIDDEN)
    })
  })

  describe('Otras rutas', () => {
    dbTest(
      'guardar un token push exige una sesión',
      async () => {
        const w = await world()
        const res = await app.request('POST', '/notifications/save-token', {
          body: { userId: w.a.user.id, token: 'fcm-token' },
        })
        assert.equal(res.status, 401)
      },
      {
        todo: 'Hueco conocido (informe): POST /notifications/save-token no tiene requireAuth y confía en el userId del cuerpo',
      }
    )

    dbTest('el registro de auditoría de beneficiarios es solo del SUPER_ADMIN', async () => {
      const w = await world()
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit')).status, 401)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.a.user })).status, FORBIDDEN)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.admin })).status, FORBIDDEN)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.superAdmin })).status, OK)
    })
  })

  dbTest('verificación: el giro de estas pruebas es del minorista A y cuesta 80,000', async () => {
    const w = await world()
    assert.equal(await DI.orm.em.fork().count(Giro), 1)
    // 100,000 - 80,000 + 4,000
    assert.equal(await available(w.a.minorista.id), 24_000)
  })
})
