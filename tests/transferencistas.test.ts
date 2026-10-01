import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { ExecutionType, Giro, GiroStatus } from '@/entities/Giro'
import { Transferencista } from '@/entities/Transferencista'
import { User, UserRole } from '@/entities/User'
import { giroService } from '@/services/GiroService'
import { transferencistaService } from '@/services/TransferencistaService'
import { whatsAppNotificationService } from '@/services/WhatsAppNotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh, inContext } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createBankAccount,
  createMinorista,
  createRate,
  createTransferencista,
  giroInput,
} from './helpers/factories'

describe('Transferencistas: siempre al menos uno disponible, y reasignación de giros', () => {
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

  const base = async () => {
    const admin = await createAdmin()
    const bank = await createBank()
    const rate = await createRate(admin)
    await createAssignmentTracker()
    return { admin, bank, rate }
  }

  /** Crea un giro de admin; se le asigna al único transferencista disponible en ese momento. */
  const crearGiro = async (b: Awaited<ReturnType<typeof base>>) => {
    const result = await giroService.createGiro(giroInput(b.bank, b.rate, { amountBs: 1_000 }), b.admin)
    assert.ok(!('error' in result), `error inesperado: ${JSON.stringify(result)}`)
    return result as Giro
  }

  const disponibles = async () =>
    (await DI.orm.em.fork().find(Transferencista, { available: true })).map((t) => t.id).sort()

  const transferencistaDe = async (giroId: string) =>
    (await DI.orm.em.fork().findOneOrFail(Giro, { id: giroId }, { populate: ['transferencista'] })).transferencista?.id

  const archivar = async (user: User) => {
    user.deletedAt = new Date()
    await DI.em.flush()
  }

  describe('regla: siempre al menos un transferencista disponible', () => {
    dbTest('no se puede deshabilitar al último transferencista disponible', async () => {
      await base()
      const t1 = await createTransferencista()

      const result = await transferencistaService.setAvailability(t1.transferencista.id, false)

      assert.deepEqual(result, { error: 'LAST_AVAILABLE' })
      assert.deepEqual(await disponibles(), [t1.transferencista.id])
    })

    dbTest('por la ruta HTTP, deshabilitar al último responde 409', async () => {
      const b = await base()
      const t1 = await createTransferencista()

      const res = await app.request('PUT', `/transferencista/${t1.transferencista.id}/toggle-availability`, {
        as: b.admin,
        body: { isAvailable: false },
      })

      assert.equal(res.status, 409)
    })

    dbTest('se puede deshabilitar a uno cuando queda otro disponible', async () => {
      await base()
      const t1 = await createTransferencista()
      const t2 = await createTransferencista()

      const result = await transferencistaService.setAvailability(t1.transferencista.id, false)

      assert.ok('success' in result)
      assert.deepEqual(await disponibles(), [t2.transferencista.id])
    })

    dbTest('dos deshabilitaciones simultáneas no dejan al sistema sin transferencistas', async () => {
      await base()
      const t1 = await createTransferencista()
      const t2 = await createTransferencista()

      const resultados = await Promise.all([
        inContext(() => transferencistaService.setAvailability(t1.transferencista.id, false)),
        inContext(() => transferencistaService.setAvailability(t2.transferencista.id, false)),
      ])

      assert.equal(resultados.filter((r) => 'success' in r).length, 1, 'solo una de las dos debe tener éxito')
      assert.equal(resultados.filter((r) => 'error' in r && r.error === 'LAST_AVAILABLE').length, 1)
      assert.equal((await disponibles()).length, 1, 'queda exactamente un transferencista disponible')
    })

    dbTest('un transferencista archivado no recibe giros nuevos', async () => {
      const b = await base()
      const archivado = await createTransferencista()
      const activo = await createTransferencista()
      await archivar(archivado.user)

      for (let i = 0; i < 3; i++) {
        const giro = await crearGiro(b)
        assert.equal(await transferencistaDe(giro.id), activo.transferencista.id)
      }
    })

    dbTest('un transferencista con el usuario inactivo no recibe giros nuevos', async () => {
      const b = await base()
      const inactivo = await createTransferencista()
      const activo = await createTransferencista()
      inactivo.user.isActive = false
      await DI.em.flush()

      const giro = await crearGiro(b)

      assert.equal(await transferencistaDe(giro.id), activo.transferencista.id)
    })

    dbTest('si el único "disponible" tiene el usuario archivado, no hay a quién asignar el giro', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      await archivar(t1.user)

      const result = await giroService.createGiro(giroInput(b.bank, b.rate, { amountBs: 1_000 }), b.admin)

      assert.deepEqual(result, { error: 'NO_TRANSFERENCISTA_ASSIGNED' })
    })

    dbTest('archivar al último transferencista disponible se rechaza', async () => {
      const b = await base()
      const t1 = await createTransferencista()

      const res = await app.request('PUT', `/user/${t1.user.id}/archive`, { as: b.admin })

      assert.equal(res.status, 409)
      assert.equal((await readFresh(User, t1.user.id)).deletedAt, null, 'el usuario sigue sin archivar')
    })

    dbTest('archivar a un transferencista lo deshabilita y reparte sus giros asignados a otro', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const giro = await crearGiro(b) // el único disponible es T1
      const t2 = await createTransferencista()
      assert.equal(await transferencistaDe(giro.id), t1.transferencista.id)

      const res = await app.request('PUT', `/user/${t1.user.id}/archive`, { as: b.admin })

      assert.equal(res.status, 200)
      assert.equal((await readFresh(Transferencista, t1.transferencista.id)).available, false)
      assert.equal(
        await transferencistaDe(giro.id),
        t2.transferencista.id,
        'el giro pasó al transferencista disponible'
      )
    })

    dbTest('desactivar al último transferencista disponible se rechaza', async () => {
      const b = await base()
      const t1 = await createTransferencista()

      const res = await app.request('PUT', `/user/${t1.user.id}/toggle-active`, { as: b.admin })

      assert.equal(res.status, 409)
      assert.equal((await readFresh(User, t1.user.id)).isActive, true)
    })

    dbTest('desactivar a un transferencista con otro disponible lo saca del reparto', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const t2 = await createTransferencista()

      const res = await app.request('PUT', `/user/${t1.user.id}/toggle-active`, { as: b.admin })

      assert.equal(res.status, 200)
      assert.deepEqual(await disponibles(), [t2.transferencista.id])
    })

    dbTest('archivar a un transferencista que ya estaba no disponible no hace falta que sea el último', async () => {
      const b = await base()
      const noDisponible = await createTransferencista({ available: false })
      await createTransferencista()

      const res = await app.request('PUT', `/user/${noDisponible.user.id}/archive`, { as: b.admin })

      assert.equal(res.status, 200)
    })
  })

  describe('reasignar un giro: POST /giro/:id/reassign', () => {
    /** El giro es de T1. T2 está disponible; T3 no disponible; T4 archivado. */
    const escenario = async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const giro = await crearGiro(b)
      const t2 = await createTransferencista()
      const t3 = await createTransferencista({ available: false })
      const t4 = await createTransferencista()
      await archivar(t4.user)
      const minorista = await createMinorista()
      return { ...b, t1, t2, t3, t4, giro, minorista }
    }

    const reasignar = (w: Awaited<ReturnType<typeof escenario>>, as: User | undefined, destino: string) =>
      app.request('POST', `/giro/${w.giro.id}/reassign`, { as, body: { newTransferencistaId: destino } })

    dbTest('exige una sesión', async () => {
      const w = await escenario()
      assert.equal((await reasignar(w, undefined, w.t2.transferencista.id)).status, 401)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })

    dbTest('un admin puede reasignar cualquier giro a un transferencista disponible', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.admin, w.t2.transferencista.id)
      assert.equal(res.status, 200)
      assert.equal(await transferencistaDe(w.giro.id), w.t2.transferencista.id)
    })

    dbTest('el transferencista dueño del giro puede pasárselo a otro disponible', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.t1.user, w.t2.transferencista.id)
      assert.equal(res.status, 200)
      assert.equal(await transferencistaDe(w.giro.id), w.t2.transferencista.id)
    })

    dbTest('un transferencista no puede quitarle un giro a otro ni quedárselo', async () => {
      const w = await escenario()
      // T2 intenta quedarse con el giro de T1
      const res = await reasignar(w, w.t2.user, w.t2.transferencista.id)
      assert.equal(res.status, 403)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id, 'el giro sigue siendo de T1')
    })

    dbTest('un minorista no puede reasignar giros', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.minorista.user, w.t2.transferencista.id)
      assert.equal(res.status, 403)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })

    dbTest('no se puede reasignar a un transferencista no disponible', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.admin, w.t3.transferencista.id)
      assert.equal(res.status, 400)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })

    dbTest('no se puede reasignar a un transferencista archivado', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.admin, w.t4.transferencista.id)
      assert.equal(res.status, 400)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })

    dbTest('reasignar a un transferencista que no existe responde 404', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.admin, '00000000-0000-4000-8000-000000000000')
      assert.equal(res.status, 404)
    })

    dbTest('un giro completado no se puede reasignar', async () => {
      const w = await escenario()
      const cuenta = await createBankAccount(w.t1.transferencista, w.bank)
      await giroService.executeGiro(w.giro.id, cuenta.id, ExecutionType.TRANSFERENCIA, 10, w.t1.user)
      assert.equal((await readFresh(Giro, w.giro.id)).status, GiroStatus.COMPLETADO)

      const res = await reasignar(w, w.admin, w.t2.transferencista.id)

      assert.equal(res.status, 400)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })

    dbTest('reasignar al mismo transferencista no cambia nada', async () => {
      const w = await escenario()
      const res = await reasignar(w, w.admin, w.t1.transferencista.id)
      assert.equal(res.status, 200)
      assert.equal(await transferencistaDe(w.giro.id), w.t1.transferencista.id)
    })
  })

  // Evita un aviso de variable sin uso para el rol, que sirve de documentación de quién actúa en los tests
  dbTest('verificación: el rol de los usuarios de transferencista es TRANSFERENCISTA', async () => {
    await base()
    const t1 = await createTransferencista()
    assert.equal(t1.user.role, UserRole.TRANSFERENCISTA)
  })
})
