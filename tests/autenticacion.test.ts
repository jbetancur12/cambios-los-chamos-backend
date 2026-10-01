import { describe, before, beforeEach, afterEach, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { DI } from '@/di'
import { User, UserRole } from '@/entities/User'
import { TokenType, UserToken } from '@/entities/UserToken'
import { SECRET_KEY } from '@/settings'
import { checkPassword, makePassword } from '@/lib/passwordUtils'
import { createUserToken } from '@/lib/userTokenUtils'
import { setupTestDb, resetTestDb, closeTestDb, dbTest, readFresh } from './helpers/db'
import { startTestApp, type TestApp } from './helpers/http'
import { createAdmin, createMinorista, createTransferencista, createUser } from './helpers/factories'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const emailUtils = require('@/lib/emailUtils')

const CLAVE = 'clave-secreta-123'

type Cuerpo = { success?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } }
const cuerpo = (res: { body: unknown }) => res.body as Cuerpo

describe('Autenticación: login, sesión, contraseñas y registro de usuarios', () => {
  let app: TestApp
  let correos: Array<{ to: string; subject: string; html: string }> = []

  before(async () => {
    await setupTestDb()
    app = await startTestApp()
  })
  beforeEach(async () => {
    await resetTestDb()
    correos = []
    // Nunca se manda un correo real: se guardan para poder leerlos
    mock.method(emailUtils, 'sendEmail', async (to: string, subject: string, html: string) => {
      correos.push({ to, subject, html })
      return { error: null }
    })
  })
  afterEach(() => mock.restoreAll())
  after(async () => {
    await app.close()
    await closeTestDb()
  })

  const usuario = (role: UserRole, cambios: Partial<User> = {}) =>
    createUser(role, { password: makePassword(CLAVE), ...cambios })

  const entrar = (email: string, password = CLAVE) => app.request('POST', '/user/login', { body: { email, password } })

  const tokenDe = async (res: { body: unknown }) => cuerpo(res).data?.token as string

  describe('login: POST /user/login', () => {
    dbTest('con credenciales correctas devuelve la sesión, el token y una cookie segura', async () => {
      const u = await usuario(UserRole.ADMIN)

      const res = await entrar(u.email)

      assert.equal(res.status, 200)
      const datos = cuerpo(res).data as { token: string; user: Record<string, unknown> }
      assert.ok(datos.token)
      assert.equal(datos.user.email, u.email)
      assert.equal(datos.user.role, UserRole.ADMIN)

      const cookie = res.headers.get('set-cookie') ?? ''
      assert.match(cookie, /accessToken=/)
      assert.match(cookie, /HttpOnly/i, 'el JavaScript de la página no puede leer la cookie')
      assert.match(cookie, /SameSite=Lax/i)
      assert.match(cookie, /Path=\//)
      assert.match(cookie, /Max-Age=2592000/, 'dura 30 días')
    })

    dbTest('la respuesta nunca incluye la contraseña', async () => {
      const u = await usuario(UserRole.ADMIN)
      const res = await entrar(u.email)
      assert.ok(!JSON.stringify(res.body).toLowerCase().includes('password'))
      assert.ok(!JSON.stringify(res.body).includes(u.password))
    })

    dbTest('una contraseña incorrecta y un correo que no existe dan la misma respuesta', async () => {
      const u = await usuario(UserRole.ADMIN)

      const mala = await entrar(u.email, 'otra-clave')
      const inexistente = await entrar('nadie@test.local')

      assert.equal(mala.status, 401)
      assert.equal(inexistente.status, 401)
      assert.deepEqual(mala.body, inexistente.body, 'no revela si el correo existe')
    })

    dbTest('el correo no distingue mayúsculas ni espacios alrededor', async () => {
      const u = await usuario(UserRole.ADMIN)
      assert.equal((await entrar(u.email.toUpperCase())).status, 200)
      assert.equal((await entrar(`  ${u.email}  `)).status, 200)
    })

    dbTest('rechaza datos inválidos con 400', async () => {
      for (const body of [
        {},
        { email: 'no-es-correo', password: CLAVE },
        { email: 'a@test.local', password: '' },
        { password: CLAVE },
      ]) {
        const res = await app.request('POST', '/user/login', { body })
        assert.equal(res.status, 400, JSON.stringify(body))
      }
    })

    dbTest('un correo sin verificar no entra, pero solo se avisa si la contraseña es correcta', async () => {
      const u = await usuario(UserRole.TRANSFERENCISTA, { emailVerified: false })

      const correcta = await entrar(u.email)
      const incorrecta = await entrar(u.email, 'otra-clave')

      assert.equal(correcta.status, 403)
      assert.equal(cuerpo(correcta).error?.code, 'EMAIL_NOT_VERIFIED')
      assert.equal(incorrecta.status, 401, 'con la contraseña mal no se revela el estado de la cuenta')
    })

    dbTest('una cuenta archivada no entra, y con la contraseña mal no se revela que está archivada', async () => {
      const u = await usuario(UserRole.MINORISTA, { deletedAt: new Date() })

      const correcta = await entrar(u.email)
      const incorrecta = await entrar(u.email, 'otra-clave')

      assert.equal(correcta.status, 403)
      assert.match(cuerpo(correcta).error?.message ?? '', /archivada/i)
      assert.equal(incorrecta.status, 401)
    })

    dbTest('una cuenta inactiva sí puede entrar (solo lectura) y la respuesta lo indica', async () => {
      const u = await usuario(UserRole.MINORISTA, { isActive: false })

      const res = await entrar(u.email)

      assert.equal(res.status, 200)
      assert.equal((cuerpo(res).data?.user as { isActive: boolean }).isActive, false)
    })

    dbTest('la respuesta trae el id de minorista o de transferencista según el rol', async () => {
      const m = await createMinorista()
      m.user.password = makePassword(CLAVE)
      const t = await createTransferencista()
      t.user.password = makePassword(CLAVE)
      await DI.em.flush()

      const comoMinorista = cuerpo(await entrar(m.user.email)).data?.user as Record<string, unknown>
      const comoTransferencista = cuerpo(await entrar(t.user.email)).data?.user as Record<string, unknown>

      assert.equal(comoMinorista.minoristaId, m.minorista.id)
      assert.equal(comoTransferencista.transferencistaId, t.transferencista.id)
    })

    dbTest(
      'un guion bajo en el correo no se toma como comodín y no confunde cuentas parecidas',
      async () => {
        // "_" significa "cualquier carácter" en la búsqueda con ILIKE: ana_1@ también coincide con anaX1@
        await usuario(UserRole.MINORISTA, {
          email: 'anaX1@test.local',
          password: makePassword('clave-de-otra-persona'),
        })
        const ana = await usuario(UserRole.MINORISTA, { email: 'ana_1@test.local' })

        const res = await entrar(ana.email)

        assert.equal(res.status, 200)
      },
      {
        todo: 'Bug: login busca el correo con ILIKE, así que "_" y "%" funcionan como comodines y pueden elegir otra cuenta',
      }
    )

    dbTest(
      'tras muchos intentos fallidos el login se bloquea',
      async () => {
        const u = await usuario(UserRole.ADMIN)
        let ultimo = 0
        for (let i = 0; i < 15; i++) ultimo = (await entrar(u.email, `mala-${i}`)).status
        assert.equal(ultimo, 429)
      },
      {
        todo: 'Bug conocido (informe): authRateLimiter está definido pero no se aplica al login ni a la recuperación de contraseña',
      }
    )
  })

  describe('sesión: tokens y GET /user/me', () => {
    dbTest('el token del login sirve como Bearer y la cookie sirve igual', async () => {
      const u = await usuario(UserRole.ADMIN)
      const login = await entrar(u.email)
      const token = await tokenDe(login)

      const conBearer = await app.request('GET', '/user/me', { token })
      const conCookie = await app.request('GET', '/user/me', { cookie: `accessToken=${token}` })

      assert.equal(conBearer.status, 200)
      assert.equal(conCookie.status, 200)
      assert.equal((cuerpo(conBearer).data?.user as { email: string }).email, u.email)
    })

    dbTest('dura 30 días', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))
      const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
      assert.equal(exp - iat, 30 * 24 * 60 * 60)
    })

    dbTest('sin token, con un token roto, de otra clave o vencido, no hay sesión', async () => {
      const u = await usuario(UserRole.ADMIN)
      const bueno = await tokenDe(await entrar(u.email))
      const datos = { email: u.email, id: u.id, role: u.role }
      const manipulado = bueno.slice(0, -4) + (bueno.endsWith('AAAA') ? 'BBBB' : 'AAAA')
      const deOtraClave = jwt.sign(datos, 'una-clave-que-no-es-la-del-servidor', { expiresIn: '1d' })
      const vencido = jwt.sign(datos, SECRET_KEY, { expiresIn: -60 })

      assert.equal((await app.request('GET', '/user/me')).status, 401, 'sin token')
      assert.equal((await app.request('GET', '/user/me', { token: 'esto-no-es-un-jwt' })).status, 401, 'token roto')
      assert.equal((await app.request('GET', '/user/me', { token: manipulado })).status, 401, 'firma alterada')
      assert.equal((await app.request('GET', '/user/me', { token: deOtraClave })).status, 401, 'otra clave')
      assert.equal((await app.request('GET', '/user/me', { token: vencido })).status, 401, 'vencido')
    })

    dbTest('un usuario archivado después de iniciar sesión pierde la sesión', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))
      assert.equal((await app.request('GET', '/user/me', { token })).status, 200)

      u.deletedAt = new Date()
      await DI.em.flush()

      assert.equal((await app.request('GET', '/user/me', { token })).status, 401)
    })

    dbTest('un usuario que ya no existe no tiene sesión aunque conserve el token', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))

      await DI.em.nativeDelete(User, { id: u.id })

      assert.equal((await app.request('GET', '/user/me', { token })).status, 401)
    })

    dbTest(
      'el rol sale de la base de datos, no del token: bajar a un admin le quita el acceso al instante',
      async () => {
        const u = await usuario(UserRole.ADMIN)
        const token = await tokenDe(await entrar(u.email))
        const crear = () =>
          app.request('POST', '/user/register', {
            token,
            body: { email: 'nuevo@test.local', password: CLAVE, fullName: 'Nuevo' },
          })

        assert.equal((await crear()).status, 201, 'siendo admin puede crear usuarios')

        u.role = UserRole.MINORISTA
        await DI.em.flush()

        assert.equal(
          (
            await app.request('POST', '/user/register', {
              token,
              body: { email: 'otro@test.local', password: CLAVE, fullName: 'Otro' },
            })
          ).status,
          403
        )
      }
    )

    dbTest('cerrar sesión borra la cookie y exige estar con sesión', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))

      const res = await app.request('POST', '/user/logout', { token })

      assert.equal(res.status, 200)
      const cookie = res.headers.get('set-cookie') ?? ''
      assert.match(cookie, /accessToken=;/, 'la cookie se vacía')
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/i, 'y se marca como vencida')
      assert.equal((await app.request('POST', '/user/logout')).status, 401)
    })

    dbTest(
      'después de cerrar sesión el token ya no sirve',
      async () => {
        const u = await usuario(UserRole.ADMIN)
        const token = await tokenDe(await entrar(u.email))

        await app.request('POST', '/user/logout', { token })

        assert.equal((await app.request('GET', '/user/me', { token })).status, 401)
      },
      { todo: 'Bug conocido (informe): el token no se revoca; sigue valiendo hasta 30 días aunque se cierre sesión' }
    )

    dbTest(
      'cambiar la contraseña invalida los tokens anteriores',
      async () => {
        const u = await usuario(UserRole.ADMIN)
        const viejo = await tokenDe(await entrar(u.email))

        await app.request('POST', '/user/change-password', {
          token: viejo,
          body: { oldPassword: CLAVE, newPassword: 'clave-nueva-456' },
        })

        assert.equal((await app.request('GET', '/user/me', { token: viejo })).status, 401)
      },
      { todo: 'Bug conocido (informe): un token robado sigue funcionando después de cambiar la contraseña' }
    )
  })

  describe('cambiar y recuperar la contraseña', () => {
    dbTest('con la contraseña actual se cambia, y solo la nueva sirve para entrar', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))

      const res = await app.request('POST', '/user/change-password', {
        token,
        body: { oldPassword: CLAVE, newPassword: 'clave-nueva-456' },
      })

      assert.equal(res.status, 200)
      assert.equal((await entrar(u.email, CLAVE)).status, 401, 'la vieja ya no sirve')
      assert.equal((await entrar(u.email, 'clave-nueva-456')).status, 200)
    })

    dbTest('con una contraseña actual incorrecta no cambia nada', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))

      const res = await app.request('POST', '/user/change-password', {
        token,
        body: { oldPassword: 'no-es-esta', newPassword: 'clave-nueva-456' },
      })

      assert.equal(res.status, 400)
      assert.equal((await entrar(u.email, CLAVE)).status, 200)
    })

    dbTest('la contraseña nueva debe tener al menos 6 caracteres y hace falta sesión', async () => {
      const u = await usuario(UserRole.ADMIN)
      const token = await tokenDe(await entrar(u.email))

      const corta = await app.request('POST', '/user/change-password', {
        token,
        body: { oldPassword: CLAVE, newPassword: '123' },
      })
      const sinSesion = await app.request('POST', '/user/change-password', {
        body: { oldPassword: CLAVE, newPassword: 'clave-nueva-456' },
      })

      assert.equal(corta.status, 400)
      assert.equal(sinSesion.status, 401)
    })

    dbTest('la contraseña se guarda cifrada, nunca en texto', async () => {
      const u = await usuario(UserRole.ADMIN)
      const guardado = (await readFresh(User, u.id)).password
      assert.notEqual(guardado, CLAVE)
      assert.ok(checkPassword(CLAVE, guardado))
      assert.ok(!checkPassword('otra', guardado))
    })

    dbTest('pedir el enlace responde igual exista o no el correo, y solo manda correo si existe', async () => {
      const u = await usuario(UserRole.ADMIN)

      const existe = await app.request('POST', '/user/send-reset-password', { body: { email: u.email } })
      const noExiste = await app.request('POST', '/user/send-reset-password', { body: { email: 'nadie@test.local' } })

      assert.equal(existe.status, 200)
      assert.equal(noExiste.status, 200)
      assert.deepEqual(existe.body, noExiste.body, 'no revela qué correos existen')
      assert.equal(correos.length, 1)
      assert.equal(correos[0].to, u.email)
      assert.match(correos[0].html, /reset-password\?token=[0-9a-f-]{36}/)
      assert.equal(
        (await app.request('POST', '/user/send-reset-password', { body: { email: 'no-es-correo' } })).status,
        400
      )
    })

    dbTest('con el enlace se cambia la contraseña, y el enlace sirve una sola vez', async () => {
      const u = await usuario(UserRole.ADMIN)
      const { token } = await createUserToken(u, TokenType.PASSWORD_RESET, 15)
      const datos = { token, newPassword: 'clave-nueva-456', confirmNewPassword: 'clave-nueva-456' }

      const primera = await app.request('POST', '/user/reset-password', { body: datos })
      const segunda = await app.request('POST', '/user/reset-password', {
        body: { ...datos, newPassword: 'otra-clave-789', confirmNewPassword: 'otra-clave-789' },
      })

      assert.equal(primera.status, 200)
      assert.equal(segunda.status, 400)
      assert.equal((await entrar(u.email, 'clave-nueva-456')).status, 200)
      assert.equal((await entrar(u.email, 'otra-clave-789')).status, 401)
    })

    dbTest('un enlace inexistente o vencido no cambia nada', async () => {
      const u = await usuario(UserRole.ADMIN)
      const vencido = await createUserToken(u, TokenType.PASSWORD_RESET, 15)
      vencido.expiresAt = new Date(Date.now() - 60_000)
      await DI.em.flush()
      const cuerpoReset = (token: string) => ({
        token,
        newPassword: 'clave-nueva-456',
        confirmNewPassword: 'clave-nueva-456',
      })

      assert.equal((await app.request('POST', '/user/reset-password', { body: cuerpoReset('no-existe') })).status, 400)
      assert.equal(
        (await app.request('POST', '/user/reset-password', { body: cuerpoReset(vencido.token) })).status,
        400
      )
      assert.equal((await entrar(u.email, CLAVE)).status, 200, 'la contraseña no cambió')
    })

    dbTest('las contraseñas deben coincidir y tener al menos 6 caracteres', async () => {
      const u = await usuario(UserRole.ADMIN)
      const { token } = await createUserToken(u, TokenType.PASSWORD_RESET, 15)

      const distintas = await app.request('POST', '/user/reset-password', {
        body: { token, newPassword: 'clave-nueva-456', confirmNewPassword: 'otra-distinta' },
      })
      const cortas = await app.request('POST', '/user/reset-password', {
        body: { token, newPassword: '123', confirmNewPassword: '123' },
      })

      assert.equal(distintas.status, 400)
      assert.equal(cortas.status, 400)
      assert.equal(
        (await DI.orm.em.fork().findOneOrFail(UserToken, { token })).used,
        false,
        'el enlace sigue sin usarse'
      )
    })

    dbTest('pedir un enlace nuevo deja sin efecto el anterior', async () => {
      const u = await usuario(UserRole.ADMIN)
      const primero = await createUserToken(u, TokenType.PASSWORD_RESET, 15)
      await createUserToken(u, TokenType.PASSWORD_RESET, 15)

      const res = await app.request('POST', '/user/reset-password', {
        body: { token: primero.token, newPassword: 'clave-nueva-456', confirmNewPassword: 'clave-nueva-456' },
      })

      assert.equal(res.status, 400)
    })
  })

  describe('crear usuarios: POST /user/register', () => {
    const registrar = (as: Parameters<TestApp['request']>[2], cambios: Record<string, unknown> = {}) =>
      app.request('POST', '/user/register', {
        ...as,
        body: { email: 'Nuevo@Test.Local', password: CLAVE, fullName: 'Persona Nueva', ...cambios },
      })

    dbTest(
      'un admin crea un usuario: correo en minúsculas, rol minorista por defecto y sin contraseña en la respuesta',
      async () => {
        const admin = await createAdmin()

        const res = await registrar({ as: admin })

        assert.equal(res.status, 201)
        const creado = cuerpo(res).data?.user as { email: string; role: string }
        assert.equal(creado.email, 'nuevo@test.local')
        assert.equal(creado.role, UserRole.MINORISTA)
        assert.ok(!JSON.stringify(res.body).includes(CLAVE))
      }
    )

    dbTest('un correo repetido, sin distinguir mayúsculas, responde 409', async () => {
      const admin = await createAdmin()
      await registrar({ as: admin })

      const repetido = await registrar({ as: admin }, { email: 'NUEVO@test.local' })

      assert.equal(repetido.status, 409)
      assert.equal(await DI.orm.em.fork().count(User, { email: 'nuevo@test.local' }), 1)
    })

    dbTest('exige contraseña de 6 caracteres, nombre, correo válido y un rol que exista', async () => {
      const admin = await createAdmin()
      for (const cambios of [{ password: '123' }, { fullName: '' }, { email: 'no-es-correo' }, { role: 'DUENO' }]) {
        assert.equal((await registrar({ as: admin }, cambios)).status, 400, JSON.stringify(cambios))
      }
    })

    dbTest('solo admin y super admin pueden crear usuarios', async () => {
      const m = await createMinorista()
      const t = await createTransferencista()

      assert.equal((await registrar({ as: m.user })).status, 403)
      assert.equal((await registrar({ as: t.user })).status, 403)
      assert.equal((await registrar({})).status, 401)
      assert.equal(await DI.orm.em.fork().count(User, { email: 'nuevo@test.local' }), 0)
    })

    dbTest(
      'un admin no puede crear un super admin',
      async () => {
        const admin = await createAdmin()

        const res = await registrar({ as: admin }, { role: 'SUPER_ADMIN' })

        assert.equal(res.status, 403)
        assert.equal(await DI.orm.em.fork().count(User, { role: UserRole.SUPER_ADMIN }), 0)
      },
      {
        todo: 'Hueco de seguridad: un ADMIN puede crear usuarios con rol SUPER_ADMIN y escalar sus propios privilegios',
      }
    )
  })
})
