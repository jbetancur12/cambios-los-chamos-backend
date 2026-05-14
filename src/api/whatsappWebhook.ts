import { Router, Request, Response } from 'express'
import { WHATSAPP_WEBHOOK_VERIFY_TOKEN, WHATSAPP_AUTOREPLY_MESSAGE } from '@/settings'
import { sendTextMessage } from '@/lib/whatsapp'
import { logger } from '@/lib/logger'

const router = Router()

/**
 * Meta envía una solicitud GET para verificar el webhook.
 * Debe responder con el challenge (hub.challenge) si hub.verify_token coincide.
 */
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string
  const token = req.query['hub.verify_token'] as string
  const challenge = req.query['hub.challenge'] as string

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('[WHATSAPP WEBHOOK] ✅ Verificación exitosa')
    res.status(200).send(challenge)
  } else {
    logger.warn({ mode, token }, '[WHATSAPP WEBHOOK] ❌ Verificación fallida')
    res.status(403).send('Verification failed')
  }
})

/**
 * Meta envía una solicitud POST cuando hay un mensaje entrante.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body

    if (body?.object !== 'whatsapp_business_account' || !body?.entry) {
      return res.status(200).json({ status: 'ignored' })
    }

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value = change.value ?? {}
        if (!value.messages) continue

        for (const message of value.messages) {
          const from = message.from
          const messageType = message.type

          // Solo responder a mensajes de texto entrantes
          if (messageType === 'text') {
            const incomingText = message.text?.body?.trim() || ''

            logger.info(
              { from, text: incomingText },
              '[WHATSAPP WEBHOOK] Mensaje entrante recibido'
            )

            // No responder si el mensaje parece venir de nuestro propio número
            if (from === value.metadata?.phone_number_id) continue

            // Enviar auto-reply
            const result = await sendTextMessage(
              from,
              WHATSAPP_AUTOREPLY_MESSAGE
            )

            if (result.success) {
              logger.info({ from, messageId: result.messageId }, '[WHATSAPP WEBHOOK] Auto-reply enviado')
            } else {
              logger.error({ from, error: result.error }, '[WHATSAPP WEBHOOK] Error enviando auto-reply')
            }
          }
        }
      }
    }

    // Meta espera un 200 OK siempre para evitar re-intentos
    res.status(200).json({ status: 'ok' })
  } catch (error) {
    logger.error({ error }, '[WHATSAPP WEBHOOK] Error procesando mensaje entrante')
    res.status(200).json({ status: 'ok' })
  }
})

export { router as whatsappWebhookRouter }
