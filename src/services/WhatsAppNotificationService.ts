import { Giro } from '@/entities/Giro'
import { logger } from '@/lib/logger'
import {
  sendTemplateMessage,
  buildGiroCreadoTemplate,
  buildGiroCompletadoTemplate,
} from '@/lib/whatsapp'

/**
 * Servicio de notificaciones WhatsApp para giros.
 *
 * Envía mensajes al número del REMITENTE (giro.senderPhone), quien es la
 * persona que envió dinero. Este campo es opcional — si no está configurado,
 * la notificación se omite silenciosamente.
 *
 * Diseñado para ser fire-and-forget: nunca bloquea ni causa rollback.
 */
export class WhatsAppNotificationService {
  /**
   * Notifica al remitente que su giro fue creado exitosamente.
   */
  async notifyGiroCreated(giro: Giro): Promise<void> {
    if (!giro.senderPhone) {
      logger.debug(
        `[WHATSAPP-GIRO] Giro ${giro.id} sin senderPhone. Omitiendo notificación de creación.`
      )
      return
    }

    const { templateName, components } = buildGiroCreadoTemplate({
      beneficiaryName: giro.beneficiaryName,
      amountBs: Number(giro.amountBs),
      bankName: giro.bankName,
      accountNumber: giro.accountNumber,
      giroId: giro.id,
    })

    const result = await sendTemplateMessage(giro.senderPhone, templateName, undefined, components)

    if (result.success) {
      logger.info(
        `[WHATSAPP-GIRO] ✅ Giro creado notificado. ID: ${giro.id}, Tel: ${giro.senderPhone}, MsgID: ${result.messageId}`
      )
    } else {
      logger.warn(
        `[WHATSAPP-GIRO] ⚠️ No se pudo notificar giro creado. ID: ${giro.id}, Tel: ${giro.senderPhone}, Error: ${result.error}`
      )
    }
  }

  /**
   * Notifica al remitente que su giro fue completado/ejecutado.
   */
  async notifyGiroCompleted(giro: Giro): Promise<void> {
    if (!giro.senderPhone) {
      logger.debug(
        `[WHATSAPP-GIRO] Giro ${giro.id} sin senderPhone. Omitiendo notificación de completado.`
      )
      return
    }

    const { templateName, components } = buildGiroCompletadoTemplate({
      beneficiaryName: giro.beneficiaryName,
      amountBs: Number(giro.amountBs),
      bankName: giro.bankName,
      executionType: giro.executionType,
      giroId: giro.id,
    })

    const result = await sendTemplateMessage(giro.senderPhone, templateName, undefined, components)

    if (result.success) {
      logger.info(
        `[WHATSAPP-GIRO] ✅ Giro completado notificado. ID: ${giro.id}, Tel: ${giro.senderPhone}, MsgID: ${result.messageId}`
      )
    } else {
      logger.warn(
        `[WHATSAPP-GIRO] ⚠️ No se pudo notificar giro completado. ID: ${giro.id}, Tel: ${giro.senderPhone}, Error: ${result.error}`
      )
    }
  }
}

// Singleton export
export const whatsAppNotificationService = new WhatsAppNotificationService()
