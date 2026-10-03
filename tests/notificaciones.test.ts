import { describe, before, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { DI } from '@/di'
import { UserFcmToken } from '@/entities/UserFcmToken'
import { UserRole } from '@/entities/User'
import { notificationService } from '@/services/NotificationService'
import { setupTestDb, resetTestDb, closeTestDb, dbTest } from './helpers/db'
import { createUser } from './helpers/factories'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const firebase = require('firebase-admin')

type Resultado = 'ok' | string // 'ok' o el código de error que devuelve Firebase

/** Simula la respuesta de Firebase: a cada token le toca el resultado indicado por nombre. */
const simularFirebase = (resultados: Record<string, Resultado>) => {
  // messaging() no es una propiedad propia del módulo, así que se define encima y se quita al terminar
  Object.defineProperty(firebase, 'messaging', {
    configurable: true,
    writable: true,
    value: () => ({
      sendEachForMulticast: async (message: { tokens: string[] }) => {
        const responses = message.tokens.map((token) =>
          resultados[token] === 'ok' ? { success: true } : { success: false, error: { code: resultados[token] } }
        )
        const successCount = responses.filter((r) => r.success).length
        return { responses, successCount, failureCount: responses.length - successCount }
      },
    }),
  })
}

const restaurarFirebase = () => {
  delete firebase.messaging
}

describe('Notificaciones push: limpieza de tokens FCM', () => {
  before(async () => {
    // El servicio solo envía si Firebase está inicializado; no se hace ninguna llamada de red porque se simula messaging()
    if (firebase.apps.length === 0) firebase.initializeApp({ projectId: 'proyecto-de-prueba' })
    await setupTestDb()
  })
  beforeEach(resetTestDb)
  afterEach(restaurarFirebase)
  after(closeTestDb)

  const usuarioConTokens = async (tokens: string[]) => {
    const user = await createUser(UserRole.MINORISTA)
    for (const fcmToken of tokens) {
      DI.em.persist(
        DI.em.create(UserFcmToken, { fcmToken, user, createdAt: new Date(), updatedAt: new Date() } as never)
      )
    }
    await DI.em.flush()
    return user
  }

  const tokensGuardados = async () => (await DI.orm.em.fork().find(UserFcmToken, {})).map((t) => t.fcmToken).sort()

  const enviar = (userId: string) =>
    notificationService.sendNotificationToUser(userId, 'Título', 'Cuerpo', { giroId: 'g1' })

  dbTest('un fallo pasajero de Firebase no borra el token', async () => {
    const user = await usuarioConTokens(['token-a', 'token-b'])
    simularFirebase({ 'token-a': 'ok', 'token-b': 'messaging/internal-error' })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), ['token-a', 'token-b'])
  })

  dbTest('un servidor de Firebase no disponible tampoco borra el token', async () => {
    const user = await usuarioConTokens(['token-a'])
    simularFirebase({ 'token-a': 'messaging/server-unavailable' })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), ['token-a'])
  })

  dbTest('un token que Firebase declara no registrado sí se borra', async () => {
    const user = await usuarioConTokens(['token-a', 'token-b'])
    simularFirebase({ 'token-a': 'ok', 'token-b': 'messaging/registration-token-not-registered' })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), ['token-a'])
  })

  dbTest('un token inválido también se borra', async () => {
    const user = await usuarioConTokens(['token-a'])
    simularFirebase({ 'token-a': 'messaging/invalid-registration-token' })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), [])
  })

  dbTest('con varios resultados mezclados solo se borra el token inválido', async () => {
    const user = await usuarioConTokens(['token-ok', 'token-pasajero', 'token-invalido'])
    simularFirebase({
      'token-ok': 'ok',
      'token-pasajero': 'messaging/server-unavailable',
      'token-invalido': 'messaging/registration-token-not-registered',
    })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), ['token-ok', 'token-pasajero'])
  })

  dbTest('los tokens de otro usuario no se tocan', async () => {
    const user = await usuarioConTokens(['token-a'])
    const otro = await usuarioConTokens(['token-otro'])
    simularFirebase({ 'token-a': 'messaging/registration-token-not-registered' })

    await enviar(user.id)

    assert.deepEqual(await tokensGuardados(), ['token-otro'])
    assert.ok(otro.id)
  })
})
