import admin from './admin_init'
import { DI } from '@/di' // Asumo que tienes la inyección de dependencias global configurada
import { UserFcmToken } from '@/entities/UserFcmToken'
import { FRONTEND_URL } from '@/settings'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 0,
  }).format(value)
}

async function getFcmTokensByUserId(userId: string): Promise<string[]> {
  const tokenRepo = DI.em.getRepository(UserFcmToken)

  try {
    const tokenRecords = await tokenRepo.find({ user: { id: userId } })

    // Extrae solo el valor del token (fcmToken) en un array de strings.
    const tokens = tokenRecords.map((r) => r.fcmToken)

    console.log(`[FCM-DB] Encontrados ${tokens.length} token(s) para el usuario ${userId}.`)

    return tokens
  } catch (error) {
    console.error(`[FCM-DB] Error al buscar tokens para el usuario ${userId}:`, error)
    return []
  }
}

export async function sendGiroAssignedNotification(
  userId: string,
  giroId: string,
  amountBs: number,
  executionType: string = 'Giro'
): Promise<void> {
  console.log(`[FCM-SENDER] Iniciando envío de notificación a usuario ${userId}`)
  const fcmTokens = await getFcmTokensByUserId(userId)

  if (fcmTokens.length === 0) {
    console.warn(`[FCM-SENDER] No se encontraron tokens para el usuario ${userId}. Notificación omitida.`)
    return
  }
  console.log(`[FCM-SENDER] Se enviará a ${fcmTokens.length} tokens.`)

  const title = executionType === 'PAGO_MOVIL' ? '💸 Nuevo Pago Móvil' : `💸 Nuevo ${executionType} Asignado`

  // Clean up execution type for display if needed
  let displayType = 'giro'
  if (executionType === 'PAGO_MOVIL') displayType = 'pago móvil'
  else if (executionType === 'RECARGA') displayType = 'recarga'
  else if (executionType === 'TRANSFERENCIA') displayType = 'giro'

  const message: admin.messaging.MulticastMessage = {
    notification: {
      title: title,
      body: `Se te ha asignado un nuevo ${displayType} por ${formatCurrency(amountBs)}. ¡Procésalo ahora!`,
    },
    data: {
      giro_id: giroId,
      amount_bs: amountBs.toString(),
      tipo: 'giro_asignado',
      execution_type: executionType,
    },

    tokens: fcmTokens, // Array de tokens a los que se enviará el mensaje
    webpush: {
      headers: {
        Urgency: 'high',
      },
      notification: {
        icon: `${FRONTEND_URL}/icons/icon-192x192.png`,
        badge: `${FRONTEND_URL}/icons/icon-192x192.png`,
      },
    },
  }

  try {
    const response = await admin.messaging().sendEachForMulticast(message)
    console.log(`[FCM] ${response.successCount} enviadas, ${response.failureCount} fallidas`)

    const toDelete: string[] = []

    response.responses.forEach((r, i) => {
      if (r.error) {
        const code = r.error.code
        const msg = r.error.message

        // Errores esperados (tokens inválidos), logging nivel WARN o INFO
        if (
          code === 'messaging/invalid-argument' ||
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/unregistered'
        ) {
          console.warn(`[FCM-CLEANUP] Token inválido detectado (${code}). Se eliminará.`)
          toDelete.push(fcmTokens[i])
        } else {
          // Otros errores reales
          console.error(`[FCM-ERROR] Error enviando a token ${fcmTokens[i].substring(0, 10)}...:`, code, msg)
        }
      }
    })
    if (toDelete.length > 0) {
      await removeInvalidTokens(toDelete)
    }
  } catch (error) {
    console.error(`[FCM] ERROR CRÍTICO al enviar el lote de notificaciones:`, error)
    throw error
  }
}

async function removeInvalidTokens(tokens: string[]): Promise<void> {
  const tokenRepo = DI.em.getRepository(UserFcmToken)

  try {
    await tokenRepo.nativeDelete({ fcmToken: { $in: tokens } })
    await DI.em.flush()
    console.log(`[FCM-CLEANUP] ${tokens.length} tokens eliminados con éxito.`)
  } catch (error) {
    console.error('[FCM-CLEANUP] Error al eliminar tokens inválidos:', error)
  }
}
