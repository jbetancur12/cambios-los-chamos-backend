import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { ExecutionType, Giro, GiroStatus } from '@/entities/Giro'
import { Minorista } from '@/entities/Minorista'
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
} from './helpers/factories'

/**
 * Who may do what with a giro, tested through the real HTTP routes.
 * A test marked `todo` asserts the correct rule and fails today because the route does not enforce it.
 */

const FORBIDDEN = 403
const OK = 200

describe('giro permissions (HTTP)', () => {
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
    assert.ok(!('error' in created), `unexpected error: ${JSON.stringify(created)}`)
    const giro = created as Giro

    const t2 = await createTransferencista()
    const account2 = await createBankAccount(t2.transferencista, bank)
    return { admin, superAdmin, bank, rate, t1, account1, t2, account2, a, b, giro }
  }

  const status = async (id: string) => (await readFresh(Giro, id)).status
  const available = async (id: string) => Number((await readFresh(Minorista, id)).availableCredit)

  describe('reading a giro: GET /giro/:id', () => {
    dbTest('requires a session', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`)).status, 401)
    })

    dbTest('the minorista who created it, its transferencista and an admin can read it', async () => {
      const w = await world()
      for (const user of [w.a.user, w.t1.user, w.admin]) {
        assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: user })).status, OK, user.role)
      }
    })

    dbTest('another minorista and another transferencista cannot read it', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: w.b.user })).status, FORBIDDEN)
      assert.equal((await app.request('GET', `/giro/${w.giro.id}`, { as: w.t2.user })).status, FORBIDDEN)
    })
  })

  describe('editing a giro: PATCH /giro/:id', () => {
    dbTest('the minorista who created it can edit the beneficiary', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
        as: w.a.user,
        body: { beneficiaryName: 'Nuevo nombre' },
      })
      assert.equal(res.status, OK)
      assert.equal((await readFresh(Giro, w.giro.id)).beneficiaryName, 'Nuevo nombre')
    })

    dbTest('a transferencista cannot edit it', async () => {
      const w = await world()
      const res = await app.request('PATCH', `/giro/${w.giro.id}`, { as: w.t1.user, body: { beneficiaryName: 'x' } })
      assert.equal(res.status, FORBIDDEN)
    })

    dbTest(
      'another minorista cannot edit it',
      async () => {
        const w = await world()
        const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
          as: w.b.user,
          body: { accountNumber: '99990000' },
        })
        assert.equal(res.status, FORBIDDEN)
        assert.notEqual((await readFresh(Giro, w.giro.id)).accountNumber, '99990000', 'the account was not changed')
      },
      { todo: 'Known hole (report): PATCH /giro/:id does not check that the giro belongs to the caller' }
    )

    dbTest(
      'another minorista cannot resend a returned giro and charge its owner',
      async () => {
        const w = await world()
        await giroService.returnGiro(w.giro.id, 'Devuelto', w.admin)
        assert.equal(await available(w.a.minorista.id), 100_000)

        await app.request('PATCH', `/giro/${w.giro.id}`, { as: w.b.user, body: { beneficiaryName: 'x' } })

        assert.equal(await status(w.giro.id), GiroStatus.DEVUELTO, 'the giro stays returned')
        assert.equal(await available(w.a.minorista.id), 100_000, "A's credit was not charged")
      },
      { todo: "Known hole (report): any minorista can reactivate another minorista's returned giro" }
    )

    dbTest(
      'a completed giro cannot be edited',
      async () => {
        const w = await world()
        await giroService.executeGiro(w.giro.id, w.account1.id, ExecutionType.TRANSFERENCIA, 10, w.t1.user)
        assert.equal(await status(w.giro.id), GiroStatus.COMPLETADO)

        const res = await app.request('PATCH', `/giro/${w.giro.id}`, {
          as: w.a.user,
          body: { accountNumber: '99990000' },
        })

        assert.notEqual(res.status, OK)
        assert.notEqual(
          (await readFresh(Giro, w.giro.id)).accountNumber,
          '99990000',
          'the destination account was not changed'
        )
      },
      { todo: 'Known hole (report): updateGiro does not look at the status, so a paid giro can be redirected' }
    )
  })

  describe('executing a giro: POST /giro/:id/execute', () => {
    const body = (accountId: string) => ({ bankAccountId: accountId, executionType: 'TRANSFERENCIA', fee: 10 })

    dbTest('a minorista and an admin cannot execute giros', async () => {
      const w = await world()
      for (const user of [w.a.user, w.admin]) {
        const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: user, body: body(w.account1.id) })
        assert.equal(res.status, FORBIDDEN, user.role)
      }
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('the assigned transferencista can execute it with their own account', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: w.t1.user, body: body(w.account1.id) })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.COMPLETADO)
    })

    dbTest('a transferencista cannot execute it with an account that is not theirs', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/execute`, { as: w.t1.user, body: body(w.account2.id) })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest(
      'a transferencista cannot execute a giro assigned to another transferencista',
      async () => {
        const w = await world()
        const res = await app.request('POST', `/giro/${w.giro.id}/execute`, {
          as: w.t2.user,
          body: body(w.account2.id),
        })
        assert.equal(res.status, FORBIDDEN)
        assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
      },
      {
        todo: 'Known hole (report): executeGiro only checks the account owner, not that the giro is assigned to the caller',
      }
    )
  })

  describe('returning and processing: POST /giro/:id/return and /mark-processing', () => {
    dbTest('a minorista cannot return a giro', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.a.user, body: { reason: 'x' } })
      assert.equal(res.status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('the assigned transferencista and an admin can return it', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, {
        as: w.t1.user,
        body: { reason: 'Cuenta inválida' },
      })
      assert.equal(res.status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.DEVUELTO)
    })

    dbTest('an admin can return it', async () => {
      const w = await world()
      const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.admin, body: { reason: 'Revisión' } })
      assert.equal(res.status, OK)
    })

    dbTest(
      'a transferencista cannot return a giro assigned to another transferencista',
      async () => {
        const w = await world()
        const res = await app.request('POST', `/giro/${w.giro.id}/return`, { as: w.t2.user, body: { reason: 'x' } })
        assert.equal(res.status, FORBIDDEN)
        assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
      },
      { todo: 'Known hole (report): returnGiro does not check that the giro is assigned to the caller' }
    )

    dbTest(
      'a transferencista cannot take over a giro assigned to another transferencista',
      async () => {
        const w = await world()
        const res = await app.request('POST', `/giro/${w.giro.id}/mark-processing`, { as: w.t2.user })
        assert.equal(res.status, FORBIDDEN)
        assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
      },
      { todo: 'Known hole (report): mark-processing does not check that the giro is assigned to the caller' }
    )
  })

  describe('cancelling a giro: DELETE /giro/:id', () => {
    dbTest('another minorista cannot cancel it', async () => {
      const w = await world()
      assert.equal((await app.request('DELETE', `/giro/${w.giro.id}`, { as: w.b.user })).status, FORBIDDEN)
      assert.equal(await status(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('the minorista who created it can cancel it', async () => {
      const w = await world()
      assert.equal((await app.request('DELETE', `/giro/${w.giro.id}`, { as: w.a.user })).status, OK)
      assert.equal(await status(w.giro.id), GiroStatus.CANCELADO)
    })
  })

  describe("reading another minorista's data", () => {
    dbTest('a minorista can read their own account and transactions', async () => {
      const w = await world()
      assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.a.user })).status, OK)
      assert.equal(
        (await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, { as: w.a.user })).status,
        OK
      )
    })

    dbTest(
      "a minorista cannot read another minorista's balance",
      async () => {
        const w = await world()
        assert.equal((await app.request('GET', `/minorista/${w.a.minorista.id}`, { as: w.b.user })).status, FORBIDDEN)
      },
      { todo: 'Known hole (report): GET /minorista/:id only requires a session' }
    )

    dbTest(
      "a minorista cannot read another minorista's transactions",
      async () => {
        const w = await world()
        const res = await app.request('GET', `/minorista-transaction/by-minorista/${w.a.minorista.id}`, {
          as: w.b.user,
        })
        assert.equal(res.status, FORBIDDEN)
      },
      { todo: 'Known hole (report): GET /minorista-transaction/by-minorista/:id only requires a session' }
    )
  })

  describe('other routes', () => {
    dbTest(
      'saving a push token requires a session',
      async () => {
        const w = await world()
        const res = await app.request('POST', '/notifications/save-token', {
          body: { userId: w.a.user.id, token: 'fcm-token' },
        })
        assert.equal(res.status, 401)
      },
      {
        todo: 'Known hole (report): POST /notifications/save-token has no requireAuth and trusts the userId in the body',
      }
    )

    dbTest('the beneficiary audit log is only for the SUPER_ADMIN', async () => {
      const w = await world()
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit')).status, 401)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.a.user })).status, FORBIDDEN)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.admin })).status, FORBIDDEN)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/audit', { as: w.superAdmin })).status, OK)
    })
  })

  dbTest('sanity: the giro used by these tests is held by minorista A and costs 80,000', async () => {
    const w = await world()
    assert.equal(await DI.orm.em.fork().count(Giro), 1)
    // 100,000 - 80,000 + 4,000
    assert.equal(await available(w.a.minorista.id), 24_000)
  })
})
