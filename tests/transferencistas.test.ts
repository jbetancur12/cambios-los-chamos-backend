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

  describe('volver a habilitar a un transferencista', () => {
    const estadoDe = async (giroId: string) => (await readFresh(Giro, giroId)).status

    dbTest('al habilitarlo vuelve a recibir giros nuevos', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const t2 = await createTransferencista()
      await transferencistaService.setAvailability(t1.transferencista.id, false)

      // Deshabilitado: todo va a T2
      for (let i = 0; i < 2; i++) assert.equal(await transferencistaDe((await crearGiro(b)).id), t2.transferencista.id)

      const habilitado = await transferencistaService.setAvailability(t1.transferencista.id, true)
      assert.ok('success' in habilitado)
      assert.deepEqual(await disponibles(), [t1.transferencista.id, t2.transferencista.id].sort())

      const asignados = new Set<string | undefined>()
      for (let i = 0; i < 4; i++) asignados.add(await transferencistaDe((await crearGiro(b)).id))
      assert.ok(asignados.has(t1.transferencista.id), 'T1 vuelve a entrar en el reparto')
      assert.ok(asignados.has(t2.transferencista.id), 'T2 sigue recibiendo giros')
    })

    dbTest('al habilitarlo no le quita los giros que ya se repartieron a otro', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const giro = await crearGiro(b) // el único disponible es T1
      const t2 = await createTransferencista()
      await transferencistaService.setAvailability(t1.transferencista.id, false)
      assert.equal(await transferencistaDe(giro.id), t2.transferencista.id)

      await transferencistaService.setAvailability(t1.transferencista.id, true)

      assert.equal(await transferencistaDe(giro.id), t2.transferencista.id, 'el giro se queda con T2')
    })

    dbTest('por la ruta HTTP, habilitar responde 200 y lo deja disponible', async () => {
      const b = await base()
      await createTransferencista()
      const t2 = await createTransferencista({ available: false })

      const res = await app.request('PUT', `/transferencista/${t2.transferencista.id}/toggle-availability`, {
        as: b.admin,
        body: { isAvailable: true },
      })

      assert.equal(res.status, 200)
      assert.equal((await readFresh(Transferencista, t2.transferencista.id)).available, true)
    })

    dbTest('habilitar a uno cuyo usuario está archivado no lo mete en el reparto', async () => {
      const b = await base()
      const archivado = await createTransferencista({ available: false })
      const activo = await createTransferencista()
      await archivar(archivado.user)

      await transferencistaService.setAvailability(archivado.transferencista.id, true)

      for (let i = 0; i < 3; i++) {
        assert.equal(await transferencistaDe((await crearGiro(b)).id), activo.transferencista.id)
      }
    })

    dbTest('deshabilitar y volver a habilitar deja el mismo estado final', async () => {
      await base()
      const t1 = await createTransferencista()
      const t2 = await createTransferencista()

      await transferencistaService.setAvailability(t1.transferencista.id, false)
      await transferencistaService.setAvailability(t1.transferencista.id, true)

      assert.deepEqual(await disponibles(), [t1.transferencista.id, t2.transferencista.id].sort())
      assert.equal(await estadoDe((await crearGiro(await base())).id), GiroStatus.ASIGNADO)
    })
  })

  describe('giros en procesamiento cuando un transferencista sale del reparto', () => {
    /** T1 tiene un giro que ya empezó a procesar; T2 está disponible. */
    const conGiroProcesando = async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const cuenta1 = await createBankAccount(t1.transferencista, b.bank)
      const giro = await crearGiro(b) // el único disponible es T1
      const procesando = await giroService.markAsProcessing(giro.id, t1.user)
      assert.ok(!('error' in procesando), `error inesperado: ${JSON.stringify(procesando)}`)
      const t2 = await createTransferencista()
      const cuenta2 = await createBankAccount(t2.transferencista, b.bank)
      return { ...b, t1, t2, cuenta1, cuenta2, giro }
    }

    const estadoDe = async (giroId: string) => (await readFresh(Giro, giroId)).status

    dbTest('al deshabilitar, el giro en procesamiento pasa a otro transferencista y vuelve a asignado', async () => {
      const w = await conGiroProcesando()
      assert.equal(await estadoDe(w.giro.id), GiroStatus.PROCESANDO)

      const result = await transferencistaService.setAvailability(w.t1.transferencista.id, false)

      assert.ok('success' in result)
      assert.equal(await transferencistaDe(w.giro.id), w.t2.transferencista.id)
      assert.equal(await estadoDe(w.giro.id), GiroStatus.ASIGNADO, 'el nuevo transferencista lo empieza de cero')
    })

    dbTest('al archivar, el giro en procesamiento también pasa a otro transferencista', async () => {
      const w = await conGiroProcesando()

      const res = await app.request('PUT', `/user/${w.t1.user.id}/archive`, { as: w.admin })

      assert.equal(res.status, 200)
      assert.equal(await transferencistaDe(w.giro.id), w.t2.transferencista.id)
      assert.equal(await estadoDe(w.giro.id), GiroStatus.ASIGNADO)
    })

    dbTest('al desactivar al usuario, el giro en procesamiento también pasa a otro', async () => {
      const w = await conGiroProcesando()

      const res = await app.request('PUT', `/user/${w.t1.user.id}/toggle-active`, { as: w.admin })

      assert.equal(res.status, 200)
      assert.equal(await transferencistaDe(w.giro.id), w.t2.transferencista.id)
    })

    dbTest('el transferencista que salió ya no puede ejecutar ese giro y el nuevo sí', async () => {
      const w = await conGiroProcesando()
      await transferencistaService.setAvailability(w.t1.transferencista.id, false)
      const cuerpo = (cuentaId: string) => ({ bankAccountId: cuentaId, executionType: 'TRANSFERENCIA', fee: 10 })

      const anterior = await app.request('POST', `/giro/${w.giro.id}/execute`, {
        as: w.t1.user,
        body: cuerpo(w.cuenta1.id),
      })
      assert.equal(anterior.status, 403)
      assert.equal(await estadoDe(w.giro.id), GiroStatus.ASIGNADO)

      const nuevo = await app.request('POST', `/giro/${w.giro.id}/execute`, {
        as: w.t2.user,
        body: cuerpo(w.cuenta2.id),
      })
      assert.equal(nuevo.status, 200)
      assert.equal(await estadoDe(w.giro.id), GiroStatus.COMPLETADO)
    })

    dbTest('los giros completados, devueltos y cancelados no se mueven', async () => {
      const b = await base()
      const t1 = await createTransferencista()
      const cuenta1 = await createBankAccount(t1.transferencista, b.bank)
      const completado = await crearGiro(b)
      const devuelto = await crearGiro(b)
      const cancelado = await crearGiro(b)
      await giroService.executeGiro(completado.id, cuenta1.id, ExecutionType.TRANSFERENCIA, 10, t1.user)
      await giroService.returnGiro(devuelto.id, 'Cuenta inválida', b.admin)
      await giroService.deleteGiro(cancelado.id, b.admin)
      await createTransferencista()

      const result = await transferencistaService.setAvailability(t1.transferencista.id, false)

      assert.ok('success' in result)
      for (const giro of [completado, devuelto, cancelado]) {
        assert.equal(await transferencistaDe(giro.id), t1.transferencista.id, 'se queda con quien lo tenía')
      }
      assert.equal(await estadoDe(completado.id), GiroStatus.COMPLETADO)
      assert.equal(await estadoDe(devuelto.id), GiroStatus.DEVUELTO)
      assert.equal(await estadoDe(cancelado.id), GiroStatus.CANCELADO)
    })

    dbTest(
      'se reparten por turnos entre los demás disponibles, incluidos los que estaban en procesamiento',
      async () => {
        const b = await base()
        const t1 = await createTransferencista()
        const asignado = await crearGiro(b)
        const procesando = await crearGiro(b)
        await giroService.markAsProcessing(procesando.id, t1.user)
        const t2 = await createTransferencista()
        const t3 = await createTransferencista()

        await transferencistaService.setAvailability(t1.transferencista.id, false)

        const nuevos = [await transferencistaDe(asignado.id), await transferencistaDe(procesando.id)]
        assert.ok(nuevos.every((id) => id === t2.transferencista.id || id === t3.transferencista.id))
        assert.equal(new Set(nuevos).size, 2, 'cada giro va a un transferencista distinto')
      }
    )
  })

  // Evita un aviso de variable sin uso para el rol, que sirve de documentación de quién actúa en los tests
  dbTest('verificación: el rol de los usuarios de transferencista es TRANSFERENCISTA', async () => {
    await base()
    const t1 = await createTransferencista()
    assert.equal(t1.user.role, UserRole.TRANSFERENCISTA)
  })
})
