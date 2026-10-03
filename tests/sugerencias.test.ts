import { describe, before, beforeEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { BeneficiarySuggestion } from '@/entities/BeneficiarySuggestion'
import { BeneficiarySuggestionLog } from '@/entities/BeneficiarySuggestionLog'
import { ExecutionType, Giro } from '@/entities/Giro'
import { User, UserRole } from '@/entities/User'
import { beneficiarySuggestionService } from '@/services/BeneficiarySuggestionService'
import { whatsAppNotificationService } from '@/services/WhatsAppNotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import {
  createAdmin,
  createAssignmentTracker,
  createBank,
  createMinorista,
  createRate,
  createTransferencista,
  createUser,
} from './helpers/factories'

type Datos<T> = { success: boolean; data: T }
const datos = <T>(res: { body: unknown }) => (res.body as Datos<T>).data

describe('Sugerencias de beneficiarios y su auditoría', () => {
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

  const guardar = (
    userId: string,
    cambios: Partial<Parameters<typeof beneficiarySuggestionService.saveBeneficiarySuggestion>[1]> = {}
  ) =>
    beneficiarySuggestionService.saveBeneficiarySuggestion(userId, {
      beneficiaryName: 'Ana Pérez',
      beneficiaryId: '123',
      phone: '',
      bankId: 'banco-1',
      accountNumber: '0102-0001',
      executionType: ExecutionType.TRANSFERENCIA,
      ...cambios,
    })

  const filasDe = (userId: string) => DI.orm.em.fork().find(BeneficiarySuggestion, { user: userId })
  const eventos = () => DI.orm.em.fork().find(BeneficiarySuggestionLog, {}, { orderBy: { createdAt: 'ASC' } })
  const minorista = () => createMinorista()

  describe('guardado', () => {
    dbTest('crea una sugerencia nueva y registra quién, cuándo y para qué giro', async () => {
      const m = await minorista()

      const sugerencia = await guardar(m.user.id, { giroId: 'giro-1' })

      assert.equal((await filasDe(m.user.id)).length, 1)
      const [evento] = await eventos()
      assert.equal(evento.action, 'CREADA')
      assert.equal(evento.userId, m.user.id)
      assert.equal(evento.userEmail, m.user.email)
      assert.equal(evento.userRole, UserRole.MINORISTA)
      assert.equal(evento.suggestionId, sugerencia.id)
      assert.equal(evento.giroId, 'giro-1')
      assert.equal(evento.beneficiaryId, '123')
      assert.equal(evento.beneficiaryName, 'Ana Pérez')
    })

    dbTest('guardar el mismo destino sin cambios no crea otra fila ni registra nada', async () => {
      const m = await minorista()
      await guardar(m.user.id)
      await guardar(m.user.id)
      await guardar(m.user.id)

      assert.equal((await filasDe(m.user.id)).length, 1)
      assert.equal((await eventos()).length, 1, 'solo el evento de creación: una refrescada no se registra')
    })

    dbTest('el mismo destino con otro nombre reutiliza la fila y registra el cambio', async () => {
      const m = await minorista()
      await guardar(m.user.id)

      await guardar(m.user.id, { beneficiaryName: 'Ana María Pérez' })

      const filas = await filasDe(m.user.id)
      assert.equal(filas.length, 1)
      assert.equal(filas[0].beneficiaryName, 'Ana María Pérez')
      const actualizada = (await eventos())[1]
      assert.equal(actualizada.action, 'ACTUALIZADA')
      assert.deepEqual(actualizada.changes, { beneficiaryName: { old: 'Ana Pérez', new: 'Ana María Pérez' } })
    })

    dbTest('la misma cédula con otra cuenta es una sugerencia nueva', async () => {
      const m = await minorista()
      await guardar(m.user.id)
      await guardar(m.user.id, { accountNumber: '0102-9999' })

      assert.equal((await filasDe(m.user.id)).length, 2)
    })

    dbTest('la misma cédula y cuenta en otro banco es una sugerencia nueva', async () => {
      const m = await minorista()
      await guardar(m.user.id)
      await guardar(m.user.id, { bankId: 'banco-2' })

      assert.equal((await filasDe(m.user.id)).length, 2)
    })

    dbTest('transferencia y pago móvil con la misma cédula son sugerencias distintas', async () => {
      const m = await minorista()
      await guardar(m.user.id)
      await guardar(m.user.id, { executionType: ExecutionType.PAGO_MOVIL, phone: '04141234567', accountNumber: '' })

      assert.equal((await filasDe(m.user.id)).length, 2)
    })

    dbTest('pago móvil: el mismo teléfono reutiliza la fila y otro teléfono crea una nueva', async () => {
      const m = await minorista()
      const pm = { executionType: ExecutionType.PAGO_MOVIL, accountNumber: '', beneficiaryName: 'Pago Móvil' }
      await guardar(m.user.id, { ...pm, phone: '04141234567' })
      await guardar(m.user.id, { ...pm, phone: '04141234567' })
      assert.equal((await filasDe(m.user.id)).length, 1)

      await guardar(m.user.id, { ...pm, phone: '04249998888' })
      assert.equal((await filasDe(m.user.id)).length, 2)
    })

    dbTest('con el id de la sugerencia se actualiza esa misma fila, sin crear otra', async () => {
      const m = await minorista()
      const original = await guardar(m.user.id)

      const actualizada = await guardar(m.user.id, { suggestionId: original.id, accountNumber: '0102-5555' })

      assert.equal(actualizada.id, original.id)
      const filas = await filasDe(m.user.id)
      assert.equal(filas.length, 1)
      assert.equal(filas[0].accountNumber, '0102-5555')
      const evento = (await eventos())[1]
      assert.equal(evento.action, 'ACTUALIZADA')
      assert.deepEqual(evento.changes, { accountNumber: { old: '0102-0001', new: '0102-5555' } })
    })

    dbTest('con el id de la sugerencia también se puede corregir la cédula', async () => {
      const m = await minorista()
      const original = await guardar(m.user.id)

      await guardar(m.user.id, { suggestionId: original.id, beneficiaryId: '999' })

      const filas = await filasDe(m.user.id)
      assert.equal(filas.length, 1)
      assert.equal(filas[0].beneficiaryId, '999')
    })

    dbTest('actualizar con el id pero sin cambios reales no registra ningún evento', async () => {
      const m = await minorista()
      const original = await guardar(m.user.id)

      await guardar(m.user.id, { suggestionId: original.id })

      assert.equal((await eventos()).length, 1)
    })

    dbTest('el id de una sugerencia de otro usuario no toca esa fila', async () => {
      const a = await minorista()
      const b = await minorista()
      const deA = await guardar(a.user.id)

      const deB = await guardar(b.user.id, { suggestionId: deA.id, beneficiaryName: 'Nombre cambiado' })

      assert.notEqual(deB.id, deA.id, 'se crea una fila propia')
      assert.equal((await filasDe(a.user.id))[0].beneficiaryName, 'Ana Pérez', 'la de A no cambió')
      assert.equal((await filasDe(b.user.id)).length, 1)
    })

    dbTest('un id que no existe se trata como una sugerencia nueva', async () => {
      const m = await minorista()
      await guardar(m.user.id, { suggestionId: '00000000-0000-4000-8000-000000000000' })
      assert.equal((await filasDe(m.user.id)).length, 1)
    })

    dbTest('un usuario que no existe no puede guardar sugerencias', async () => {
      await assert.rejects(guardar('00000000-0000-4000-8000-000000000000'), /User not found/)
    })
  })

  describe('lista y búsqueda: cada usuario ve solo las suyas', () => {
    const lista = async (as: User, consulta = '') =>
      datos<{ suggestions: BeneficiarySuggestion[] }>(
        await app.request('GET', `/beneficiary-suggestion/${consulta}`, { as })
      ).suggestions

    dbTest('la lista de un usuario no incluye las de otro', async () => {
      const a = await minorista()
      const b = await minorista()
      await guardar(a.user.id, { beneficiaryName: 'De A' })
      await guardar(b.user.id, { beneficiaryName: 'De B' })

      const deA = await lista(a.user, 'list')
      const deB = await lista(b.user, 'list')

      assert.deepEqual(
        deA.map((s) => s.beneficiaryName),
        ['De A']
      )
      assert.deepEqual(
        deB.map((s) => s.beneficiaryName),
        ['De B']
      )
    })

    dbTest('la lista llega con la más reciente primero', async () => {
      const m = await minorista()
      await guardar(m.user.id, { beneficiaryName: 'Primera', beneficiaryId: '1' })
      await guardar(m.user.id, { beneficiaryName: 'Segunda', beneficiaryId: '2' })
      await guardar(m.user.id, { beneficiaryName: 'Tercera', beneficiaryId: '3' })

      const resultado = await lista(m.user, 'list')

      assert.deepEqual(
        resultado.map((s) => s.beneficiaryName),
        ['Tercera', 'Segunda', 'Primera']
      )
    })

    dbTest('la búsqueda por nombre ignora tildes y mayúsculas', async () => {
      const m = await minorista()
      await guardar(m.user.id, { beneficiaryName: 'José Pérez' })
      await guardar(m.user.id, { beneficiaryName: 'Otra Persona', beneficiaryId: '2' })

      const resultado = await lista(m.user, 'search?q=JOSE%20perez')

      assert.deepEqual(
        resultado.map((s) => s.beneficiaryName),
        ['José Pérez']
      )
    })

    dbTest('también se busca por cédula y por número de cuenta', async () => {
      const m = await minorista()
      await guardar(m.user.id, { beneficiaryName: 'Uno', beneficiaryId: '11111', accountNumber: 'AAA-100' })
      await guardar(m.user.id, { beneficiaryName: 'Dos', beneficiaryId: '22222', accountNumber: 'BBB-200' })

      assert.deepEqual(
        (await lista(m.user, 'search?q=2222')).map((s) => s.beneficiaryName),
        ['Dos']
      )
      assert.deepEqual(
        (await lista(m.user, 'search?q=AAA')).map((s) => s.beneficiaryName),
        ['Uno']
      )
    })

    dbTest('la búsqueda puede limitarse a transferencias o a pagos móviles', async () => {
      const m = await minorista()
      await guardar(m.user.id, { beneficiaryName: 'Transfer', beneficiaryId: '1' })
      await guardar(m.user.id, {
        beneficiaryName: 'Pago',
        beneficiaryId: '2',
        executionType: ExecutionType.PAGO_MOVIL,
        phone: '0414',
        accountNumber: '',
      })

      const soloPagos = await lista(m.user, 'search?q=&executionType=PAGO_MOVIL')
      const soloTransfer = await lista(m.user, 'search?q=&executionType=TRANSFERENCIA')

      assert.deepEqual(
        soloPagos.map((s) => s.beneficiaryName),
        ['Pago']
      )
      assert.deepEqual(
        soloTransfer.map((s) => s.beneficiaryName),
        ['Transfer']
      )
    })

    dbTest('las rutas de sugerencias exigen sesión', async () => {
      assert.equal((await app.request('GET', '/beneficiary-suggestion/list')).status, 401)
      assert.equal((await app.request('GET', '/beneficiary-suggestion/search?q=a')).status, 401)
    })
  })

  describe('guardar y eliminar por la API', () => {
    dbTest('POST /save sin los datos obligatorios responde 400', async () => {
      const m = await minorista()
      const res = await app.request('POST', '/beneficiary-suggestion/save', {
        as: m.user,
        body: { beneficiaryName: 'Solo nombre' },
      })
      assert.equal(res.status, 400)
    })

    dbTest('POST /save de un pago móvil no exige número de cuenta', async () => {
      const m = await minorista()
      const res = await app.request('POST', '/beneficiary-suggestion/save', {
        as: m.user,
        body: {
          beneficiaryName: 'Pago Móvil',
          beneficiaryId: '123',
          phone: '04141234567',
          bankId: 'banco-1',
          executionType: 'PAGO_MOVIL',
        },
      })
      assert.equal(res.status, 200)
    })

    dbTest('eliminar una sugerencia la borra y deja el registro con lo que tenía', async () => {
      const m = await minorista()
      const sugerencia = await guardar(m.user.id)

      const res = await app.request('DELETE', `/beneficiary-suggestion/${sugerencia.id}`, { as: m.user })

      assert.equal(res.status, 200)
      assert.equal((await filasDe(m.user.id)).length, 0)
      const evento = (await eventos()).find((e) => e.action === 'ELIMINADA')
      assert.ok(evento, 'quedó el evento de eliminación')
      assert.equal(evento?.suggestionId, sugerencia.id)
      assert.equal(evento?.snapshot?.beneficiaryName, 'Ana Pérez')
    })

    dbTest('no se puede eliminar la sugerencia de otro usuario', async () => {
      const a = await minorista()
      const b = await minorista()
      const deA = await guardar(a.user.id)

      const res = await app.request('DELETE', `/beneficiary-suggestion/${deA.id}`, { as: b.user })

      assert.equal(res.status, 404)
      assert.equal((await filasDe(a.user.id)).length, 1)
    })

    dbTest('eliminar todas borra solo las del usuario y registra una eliminación por cada una', async () => {
      const a = await minorista()
      const b = await minorista()
      await guardar(a.user.id, { beneficiaryId: '1' })
      await guardar(a.user.id, { beneficiaryId: '2' })
      await guardar(b.user.id, { beneficiaryId: '3' })

      const res = await app.request('DELETE', '/beneficiary-suggestion', { as: a.user })

      assert.equal(res.status, 200)
      assert.equal((await filasDe(a.user.id)).length, 0)
      assert.equal((await filasDe(b.user.id)).length, 1, 'las de B siguen ahí')
      assert.equal((await eventos()).filter((e) => e.action === 'ELIMINADA').length, 2)
    })
  })

  describe('las sugerencias se guardan al crear el giro', () => {
    /** Un minorista con crédito, un transferencista disponible, un banco y una tasa. */
    const escenario = async () => {
      const admin = await createAdmin()
      const bank = await createBank()
      await createRate(admin)
      await createAssignmentTracker()
      await createTransferencista()
      const m = await createMinorista({ creditLimit: 1_000_000 })
      return { admin, bank, m }
    }

    const cuerpoGiro = (bankId: string, cambios: Record<string, unknown> = {}) => ({
      beneficiaryName: 'Ana Pérez',
      beneficiaryId: '123',
      bankId,
      accountNumber: '0102-0001',
      phone: '',
      amountInput: 100_000,
      currencyInput: 'COP',
      ...cambios,
    })

    dbTest('crear un giro guarda la sugerencia y la liga al giro', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', { as: w.m.user, body: cuerpoGiro(w.bank.id) })

      assert.equal(res.status, 200)
      const giro = datos<{ giro: Giro }>(res).giro
      assert.equal((await filasDe(w.m.user.id)).length, 1)
      const evento = (await eventos())[0]
      assert.equal(evento.action, 'CREADA')
      assert.equal(evento.giroId, giro.id)
    })

    dbTest('un giro de admin también guarda la sugerencia, a nombre del admin', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', { as: w.admin, body: cuerpoGiro(w.bank.id) })

      assert.equal(res.status, 200)
      assert.equal((await filasDe(w.admin.id)).length, 1)
      assert.equal((await filasDe(w.m.user.id)).length, 0)
    })

    dbTest('si el giro falla por saldo insuficiente no se guarda ninguna sugerencia', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/create', {
        as: w.m.user,
        body: cuerpoGiro(w.bank.id, { amountInput: 5_000_000 }),
      })

      assert.equal(res.status, 400)
      assert.equal((await filasDe(w.m.user.id)).length, 0)
      assert.equal((await eventos()).length, 0)
    })

    dbTest('enviar el id de la sugerencia al crear el giro actualiza esa sugerencia', async () => {
      const w = await escenario()
      const original = await guardar(w.m.user.id, { bankId: w.bank.id })

      const res = await app.request('POST', '/giro/create', {
        as: w.m.user,
        body: cuerpoGiro(w.bank.id, { suggestionId: original.id, accountNumber: '0102-7777' }),
      })

      assert.equal(res.status, 200)
      const filas = await filasDe(w.m.user.id)
      assert.equal(filas.length, 1, 'no se creó otra')
      assert.equal(filas[0].accountNumber, '0102-7777')
    })

    dbTest('sin el id, un destino distinto crea otra sugerencia y deja la anterior', async () => {
      const w = await escenario()
      await guardar(w.m.user.id, { bankId: w.bank.id })

      await app.request('POST', '/giro/create', {
        as: w.m.user,
        body: cuerpoGiro(w.bank.id, { accountNumber: '0102-8888' }),
      })

      assert.equal((await filasDe(w.m.user.id)).length, 2)
    })

    dbTest('un pago móvil sin contacto se guarda con el nombre "Pago Móvil"', async () => {
      const w = await escenario()

      const res = await app.request('POST', '/giro/mobile-payment/create', {
        as: w.m.user,
        body: { cedula: '555', bankId: w.bank.id, phone: '04141234567', amountCop: 50_000 },
      })

      assert.equal(res.status, 201)
      const [sugerencia] = await filasDe(w.m.user.id)
      assert.equal(sugerencia.beneficiaryName, 'Pago Móvil')
      assert.equal(sugerencia.executionType, ExecutionType.PAGO_MOVIL)
    })

    dbTest(
      'los nombres "Sistema" y "NA", que dejaban versiones anteriores, también quedan como "Pago Móvil"',
      async () => {
        const w = await escenario()
        for (const contactoEnvia of ['Sistema', 'NA', '   ']) {
          await app.request('POST', '/giro/mobile-payment/create', {
            as: w.m.user,
            body: {
              cedula: `c-${contactoEnvia.trim()}`,
              bankId: w.bank.id,
              phone: '04140000000',
              contactoEnvia,
              amountCop: 10_000,
            },
          })
        }

        const nombres = (await filasDe(w.m.user.id)).map((s) => s.beneficiaryName)
        assert.deepEqual([...new Set(nombres)], ['Pago Móvil'])
      }
    )

    dbTest('con un contacto real, el pago móvil se guarda con ese nombre', async () => {
      const w = await escenario()

      await app.request('POST', '/giro/mobile-payment/create', {
        as: w.m.user,
        body: {
          cedula: '555',
          bankId: w.bank.id,
          phone: '04141234567',
          contactoEnvia: 'Carlos Ruiz',
          amountCop: 50_000,
        },
      })

      const [sugerencia] = await filasDe(w.m.user.id)
      assert.equal(sugerencia.beneficiaryName, 'Carlos Ruiz')
    })
  })

  describe('registro de auditoría: GET /beneficiary-suggestion/audit', () => {
    const consulta = async (superAdmin: User, parametros = '') =>
      datos<{
        entries: Array<BeneficiarySuggestionLog & { userName: string | null }>
        total: number
        limit: number
        offset: number
      }>(await app.request('GET', `/beneficiary-suggestion/audit${parametros}`, { as: superAdmin }))

    /** Fecha local como YYYY-MM-DD, desplazada por días. */
    const fecha = (dias: number) => {
      const d = new Date()
      d.setDate(d.getDate() + dias)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const conEventos = async () => {
      const superAdmin = await createUser(UserRole.SUPER_ADMIN)
      const a = await minorista()
      const b = await minorista()
      await guardar(a.user.id, { beneficiaryName: 'Ana Pérez', beneficiaryId: '111' })
      await guardar(a.user.id, {
        beneficiaryName: 'Contacto Móvil',
        beneficiaryId: '222',
        executionType: ExecutionType.PAGO_MOVIL,
        phone: '04141112222',
        accountNumber: '',
      })
      await guardar(b.user.id, { beneficiaryName: 'Beto Gómez', beneficiaryId: '333' })
      // Un cambio de nombre en la sugerencia de A: genera un evento ACTUALIZADA
      await guardar(a.user.id, { beneficiaryName: 'Ana M. Pérez', beneficiaryId: '111' })
      return { superAdmin, a, b }
    }

    dbTest('lista los eventos del más reciente al más antiguo, con el total', async () => {
      const w = await conEventos()

      const resultado = await consulta(w.superAdmin)

      assert.equal(resultado.total, 4)
      assert.equal(resultado.entries.length, 4)
      const fechas = resultado.entries.map((e) => new Date(e.createdAt).getTime())
      assert.deepEqual(
        fechas,
        [...fechas].sort((x, y) => y - x)
      )
    })

    dbTest('cada evento trae el nombre completo del usuario', async () => {
      const w = await conEventos()
      const resultado = await consulta(w.superAdmin, `?user=${encodeURIComponent(w.b.user.email)}`)

      assert.equal(resultado.entries.length, 1)
      assert.equal(resultado.entries[0].userName, w.b.user.fullName)
    })

    dbTest('filtra por usuario con parte del correo', async () => {
      const w = await conEventos()
      const resultado = await consulta(w.superAdmin, `?user=${encodeURIComponent(w.a.user.email.slice(0, 12))}`)

      assert.ok(resultado.entries.length > 0)
      assert.ok(resultado.entries.every((e) => e.userId === w.a.user.id))
    })

    dbTest('filtra por beneficiario, contacto o celular', async () => {
      const w = await conEventos()

      const porNombre = await consulta(w.superAdmin, '?beneficiary=beto')
      const porContacto = await consulta(w.superAdmin, '?beneficiary=Contacto')
      const porCelular = await consulta(w.superAdmin, '?beneficiary=1112222')

      assert.deepEqual(
        porNombre.entries.map((e) => e.beneficiaryId),
        ['333']
      )
      assert.deepEqual(
        porContacto.entries.map((e) => e.beneficiaryId),
        ['222']
      )
      assert.deepEqual(
        porCelular.entries.map((e) => e.beneficiaryId),
        ['222']
      )
    })

    dbTest('filtra por cédula, por acción y por tipo', async () => {
      const w = await conEventos()

      assert.equal((await consulta(w.superAdmin, '?beneficiaryId=111')).total, 2)
      assert.equal((await consulta(w.superAdmin, '?action=ACTUALIZADA')).total, 1)
      assert.equal((await consulta(w.superAdmin, '?action=CREADA')).total, 3)
      assert.equal((await consulta(w.superAdmin, '?executionType=PAGO_MOVIL')).total, 1)
    })

    dbTest('filtra por rango de fechas', async () => {
      const w = await conEventos()

      assert.equal(
        (await consulta(w.superAdmin, `?from=${fecha(-1)}&to=${fecha(1)}`)).total,
        4,
        'hoy está dentro del rango'
      )
      assert.equal((await consulta(w.superAdmin, `?from=${fecha(1)}`)).total, 0, 'desde mañana no hay nada')
      assert.equal((await consulta(w.superAdmin, `?to=${fecha(-1)}`)).total, 0, 'hasta ayer no hay nada')
    })

    dbTest('pagina con límite y desplazamiento, y el total no cambia', async () => {
      const w = await conEventos()

      const primera = await consulta(w.superAdmin, '?limit=3&offset=0')
      const segunda = await consulta(w.superAdmin, '?limit=3&offset=3')

      assert.equal(primera.total, 4)
      assert.equal(primera.entries.length, 3)
      assert.equal(segunda.entries.length, 1)
      const ids = [...primera.entries, ...segunda.entries].map((e) => e.id)
      assert.equal(new Set(ids).size, 4, 'ningún evento se repite entre páginas')
    })

    dbTest('el límite máximo por consulta es 200', async () => {
      const w = await conEventos()
      assert.equal((await consulta(w.superAdmin, '?limit=100000')).limit, 200)
    })

    dbTest('sin resultados devuelve una lista vacía, no un error', async () => {
      const w = await conEventos()

      const res = await app.request('GET', '/beneficiary-suggestion/audit?beneficiary=no-existe-nadie', {
        as: w.superAdmin,
      })

      assert.equal(res.status, 200)
      const resultado = datos<{ entries: unknown[]; total: number }>(res)
      assert.deepEqual(resultado.entries, [])
      assert.equal(resultado.total, 0)
    })
  })
})
